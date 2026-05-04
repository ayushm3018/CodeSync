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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const GRACE_PERIOD_MS = 30_000;
const SAVE_DEBOUNCE_MS = 2_000;

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
});

redis.on('error', (err) => console.error('[redis]', err.message));

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

function metaKey(id)  { return `room:${id}:meta`; }
function docKey(id)   { return `room:${id}:doc`; }

function scheduleSave(roomId) {
    if (saveTimers.has(roomId)) clearTimeout(saveTimers.get(roomId));
    const timer = setTimeout(() => saveDoc(roomId), SAVE_DEBOUNCE_MS);
    saveTimers.set(roomId, timer);
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
    doc.on('update', () => scheduleSave(roomId));
    docs.set(roomId, doc);
}

function getDoc(roomId) {
    return docs.get(roomId);
}

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
    await redis.del(metaKey(roomId), docKey(roomId));
    console.log(`[room ${roomId}] deleted`);
}

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

app.post('/rooms', async (req, res) => {
    const { creator } = req.body || {};
    if (!creator || typeof creator !== 'string' || !creator.trim()) {
        return res.status(400).json({ error: 'creator (username) required' });
    }
    let roomId;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));
    const trimmedCreator = creator.trim();
    const createdAt = Date.now();

    await redis.hset(metaKey(roomId), { creator: trimmedCreator, createdAt: String(createdAt) });
    rooms.set(roomId, {
        creator: trimmedCreator,
        createdAt,
        connectionCount: 0,
        deletionTimer: setTimeout(() => deleteRoom(roomId), GRACE_PERIOD_MS),
    });
    console.log(`[room ${roomId}] created by ${trimmedCreator}`);
    res.json({ id: roomId, creator: trimmedCreator });
});

app.get('/rooms/:id', (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ exists: false });
    res.json({ exists: true, creator: room.creator });
});

app.get('/health', (req, res) => {
    res.status(200).json({ message: 'ok', success: true });
});

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
            const roomToDelete = socketRoom;
            room.deletionTimer = setTimeout(() => deleteRoom(roomToDelete), GRACE_PERIOD_MS);
        }
    });
});

restoreRoomsFromRedis()
    .then(() => httpServer.listen(3000, () => console.log('Server is running on port 3000')))
    .catch((err) => {
        console.error('Failed to restore from Redis:', err);
        process.exit(1);
    });
