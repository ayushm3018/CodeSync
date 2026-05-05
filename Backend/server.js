import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as Y from 'yjs';
import {
    Awareness,
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from 'y-protocols/awareness';
import path from 'path';
import { fileURLToPath } from 'url';
import { customAlphabet } from 'nanoid';
import cors from 'cors';
import Redis from 'ioredis';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const GRACE_PERIOD_MS = 30_000;
const SAVE_DEBOUNCE_MS = 2_000;
const CHAT_HISTORY_LIMIT = 10;
const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
});
redis.on('error', (err) => console.error('[redis]', err.message));

const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
if (!genAI) {
    console.warn('[ai] GEMINI_API_KEY not set — chat will not work');
}

const SYSTEM_PROMPT = `You are CodeAssist, an AI helper embedded inside a collaborative code editor.
Multiple users may be editing code together and asking you questions about it.
You can see the current code in the editor and the recent chat history.
Answer concisely. When discussing code, reference specific lines, functions, or variables when helpful.
Do not generate large blocks of code unless explicitly asked — your job is to explain and answer questions.`;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const docs = new Map();
const awarenesses = new Map();
const rooms = new Map();
const saveTimers = new Map();
const chatBusy = new Map();

function metaKey(id) { return `room:${id}:meta`; }
function docKey(id)  { return `room:${id}:doc`; }

function scheduleSave(roomId) {
    if (saveTimers.has(roomId)) clearTimeout(saveTimers.get(roomId));
    saveTimers.set(roomId, setTimeout(() => saveDoc(roomId), SAVE_DEBOUNCE_MS));
}

async function saveDoc(roomId) {
    saveTimers.delete(roomId);
    const doc = docs.get(roomId);
    if (!doc) return;
    const bytes = Y.encodeStateAsUpdate(doc);
    await redis.set(docKey(roomId), Buffer.from(bytes));
}

async function ensureDocLoaded(roomId) {
    if (docs.has(roomId)) return;
    const bytes = await redis.getBuffer(docKey(roomId));
    const doc = new Y.Doc();
    if (bytes) Y.applyUpdate(doc, new Uint8Array(bytes));
    doc.on('update', (update, origin) => {
        scheduleSave(roomId);
        if (origin === 'server') {
            io.to(roomId).emit('update', update);
        }
    });
    docs.set(roomId, doc);
    setupChatWatcher(roomId, doc);
}

function getDoc(roomId) { return docs.get(roomId); }

function getAwareness(roomId) {
    let a = awarenesses.get(roomId);
    if (!a) {
        a = new Awareness(getDoc(roomId));
        awarenesses.set(roomId, a);
    }
    return a;
}

async function deleteRoom(roomId) {
    rooms.delete(roomId);
    docs.delete(roomId);
    const a = awarenesses.get(roomId);
    if (a) a.destroy();
    awarenesses.delete(roomId);
    if (saveTimers.has(roomId)) {
        clearTimeout(saveTimers.get(roomId));
        saveTimers.delete(roomId);
    }
    chatBusy.delete(roomId);
    await redis.del(metaKey(roomId), docKey(roomId));
    console.log(`[room ${roomId}] deleted`);
}

// ---------- Chat / AI ----------

function getChat(doc)  { return doc.getArray('chat'); }

function chatNeedsResponse(yChat) {
    let users = 0, assistants = 0;
    yChat.forEach(m => {
        const role = m.get('role');
        if (role === 'user') users++;
        else if (role === 'assistant') assistants++;
    });
    return users > assistants;
}

function buildAIPrompt(doc) {
    const code = doc.getText('monaco').toString() || '(editor is empty)';
    const yChat = getChat(doc);
    const all = yChat.toArray();
    const recent = all.slice(-CHAT_HISTORY_LIMIT);
    const latestUser = recent[recent.length - 1];
    const history = recent.slice(0, -1).map(m => {
        const role = m.get('role');
        const speaker = role === 'user' ? m.get('username') : 'CodeAssist';
        return `${speaker}: ${m.get('content')}`;
    }).join('\n\n');

    return [
        `Current code in the editor:\n\`\`\`\n${code}\n\`\`\``,
        history ? `Recent conversation:\n${history}` : null,
        `New question from ${latestUser.get('username')}:\n${latestUser.get('content')}`,
    ].filter(Boolean).join('\n\n');
}

async function generateAIResponse(roomId) {
    if (!genAI) {
        console.warn(`[room ${roomId}] AI not configured — skipping`);
        return;
    }
    const doc = getDoc(roomId);
    if (!doc) return;
    const yChat = getChat(doc);

    const model = genAI.getGenerativeModel({
        model: AI_MODEL,
        systemInstruction: SYSTEM_PROMPT,
    });

    const prompt = buildAIPrompt(doc);
    let text;
    try {
        const result = await model.generateContent(prompt);
        text = result.response.text();
    } catch (err) {
        console.error(`[room ${roomId}] AI error:`, err.message);
        text = `_(CodeAssist hit an error: ${err.message})_`;
    }

    doc.transact(() => {
        const msg = new Y.Map();
        msg.set('id', `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        msg.set('role', 'assistant');
        msg.set('username', 'CodeAssist');
        msg.set('content', text);
        msg.set('timestamp', Date.now());
        yChat.push([msg]);
    }, 'server');
}

function setupChatWatcher(roomId, doc) {
    const yChat = getChat(doc);
    const handler = async () => {
        if (chatBusy.get(roomId)) return;
        if (!chatNeedsResponse(yChat)) return;
        chatBusy.set(roomId, true);
        try {
            while (chatNeedsResponse(yChat)) {
                await generateAIResponse(roomId);
            }
        } finally {
            chatBusy.set(roomId, false);
        }
    };
    yChat.observe(handler);
}

// ---------- Redis room restore ----------

async function restoreRoomsFromRedis() {
    let cursor = '0';
    const found = [];
    do {
        const [next, batch] = await redis.scan(cursor, 'MATCH', 'room:*:meta', 'COUNT', 100);
        cursor = next;
        found.push(...batch);
    } while (cursor !== '0');

    for (const key of found) {
        const id = key.slice('room:'.length, -':meta'.length);
        const meta = await redis.hgetall(key);
        if (!meta || !meta.creator) continue;
        rooms.set(id, {
            creator: meta.creator,
            createdAt: Number(meta.createdAt) || Date.now(),
            connectionCount: 0,
            deletionTimer: setTimeout(() => deleteRoom(id), GRACE_PERIOD_MS),
        });
    }
    console.log(`[startup] restored ${rooms.size} rooms from Redis`);
}

// ---------- HTTP routes ----------

app.post('/rooms', async (req, res) => {
    const { creator } = req.body || {};
    if (!creator || typeof creator !== 'string' || !creator.trim()) {
        return res.status(400).json({ error: 'creator (username) required' });
    }
    let roomId;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));
    const trimmed = creator.trim();
    const createdAt = Date.now();

    await redis.hset(metaKey(roomId), { creator: trimmed, createdAt: String(createdAt) });
    rooms.set(roomId, {
        creator: trimmed,
        createdAt,
        connectionCount: 0,
        deletionTimer: setTimeout(() => deleteRoom(roomId), GRACE_PERIOD_MS),
    });
    console.log(`[room ${roomId}] created by ${trimmed}`);
    res.json({ id: roomId, creator: trimmed });
});

app.get('/rooms/:id', (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ exists: false });
    res.json({ exists: true, creator: room.creator });
});

app.get('/health', (req, res) => res.json({ message: 'ok', success: true }));

// ---------- Socket.io ----------

io.on('connection', (socket) => {
    let socketRoom = null;
    let socketClientId = null;

    socket.on('join', async ({ roomId, clientId }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('room-error', { message: 'Room not found' });
            socket.disconnect(true);
            return;
        }

        socketRoom = roomId;
        socketClientId = clientId;
        socket.join(roomId);

        if (room.deletionTimer) {
            clearTimeout(room.deletionTimer);
            room.deletionTimer = null;
            console.log(`[room ${roomId}] deletion cancelled`);
        }
        room.connectionCount++;

        await ensureDocLoaded(roomId);

        socket.emit('room-info', { id: roomId, creator: room.creator });

        const doc = getDoc(roomId);
        socket.emit('sync', Y.encodeStateAsUpdate(doc));

        const awareness = getAwareness(roomId);
        const states = awareness.getStates();
        if (states.size > 0) {
            socket.emit('awareness', encodeAwarenessUpdate(awareness, [...states.keys()]));
        }
    });

    socket.on('update', async ({ roomId, update }) => {
        if (!rooms.has(roomId)) return;
        await ensureDocLoaded(roomId);
        Y.applyUpdate(getDoc(roomId), new Uint8Array(update));
        socket.to(roomId).emit('update', update);
    });

    socket.on('awareness', async ({ roomId, update, clientId }) => {
        if (!rooms.has(roomId)) return;
        await ensureDocLoaded(roomId);
        if (clientId != null) socketClientId = clientId;
        applyAwarenessUpdate(getAwareness(roomId), new Uint8Array(update), socket.id);
        socket.to(roomId).emit('awareness', update);
    });

    socket.on('disconnect', () => {
        if (!socketRoom) return;
        const room = rooms.get(socketRoom);
        if (!room) return;

        if (socketClientId != null && awarenesses.has(socketRoom)) {
            const awareness = getAwareness(socketRoom);
            removeAwarenessStates(awareness, [socketClientId], 'connection-closed');
            const removalUpdate = encodeAwarenessUpdate(awareness, [socketClientId]);
            io.to(socketRoom).emit('awareness', removalUpdate);
        }

        room.connectionCount = Math.max(0, room.connectionCount - 1);
        if (room.connectionCount === 0) {
            console.log(`[room ${socketRoom}] empty, deletion in ${GRACE_PERIOD_MS}ms`);
            const id = socketRoom;
            room.deletionTimer = setTimeout(() => deleteRoom(id), GRACE_PERIOD_MS);
        }
    });
});

restoreRoomsFromRedis()
    .then(() => httpServer.listen(3000, () => console.log('Server is running on port 3000')))
    .catch((err) => {
        console.error('Failed to restore from Redis:', err);
        process.exit(1);
    });
