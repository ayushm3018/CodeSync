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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const GRACE_PERIOD_MS = 30_000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const docs = new Map();
const awarenesses = new Map();
const rooms = new Map();

function getDoc(roomId) {
    let doc = docs.get(roomId);
    if (!doc) {
        doc = new Y.Doc();
        docs.set(roomId, doc);
    }
    return doc;
}

function getAwareness(roomId) {
    let a = awarenesses.get(roomId);
    if (!a) {
        a = new Awareness(getDoc(roomId));
        awarenesses.set(roomId, a);
    }
    return a;
}

function deleteRoom(roomId) {
    rooms.delete(roomId);
    docs.delete(roomId);
    const a = awarenesses.get(roomId);
    if (a) a.destroy();
    awarenesses.delete(roomId);
    console.log(`[room ${roomId}] deleted`);
}

app.post('/rooms', (req, res) => {
    const { creator } = req.body || {};
    if (!creator || typeof creator !== 'string' || !creator.trim()) {
        return res.status(400).json({ error: 'creator (username) required' });
    }
    let roomId;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));
    rooms.set(roomId, {
        creator: creator.trim(),
        createdAt: Date.now(),
        connectionCount: 0,
        deletionTimer: null,
    });
    console.log(`[room ${roomId}] created by ${creator.trim()}`);
    res.json({ id: roomId, creator: creator.trim() });
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

    socket.on('join', ({ roomId, clientId }) => {
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

        socket.emit('room-info', { id: roomId, creator: room.creator });

        const doc = getDoc(roomId);
        socket.emit('sync', Y.encodeStateAsUpdate(doc));

        const awareness = getAwareness(roomId);
        const states = awareness.getStates();
        if (states.size > 0) {
            socket.emit('awareness', encodeAwarenessUpdate(awareness, [...states.keys()]));
        }
    });

    socket.on('update', ({ roomId, update }) => {
        if (!rooms.has(roomId)) return;
        Y.applyUpdate(getDoc(roomId), new Uint8Array(update));
        socket.to(roomId).emit('update', update);
    });

    socket.on('awareness', ({ roomId, update, clientId }) => {
        if (!rooms.has(roomId)) return;
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

httpServer.listen(3000, () => {
    console.log('Server is running on port 3000');
});
