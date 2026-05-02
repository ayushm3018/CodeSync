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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const docs = new Map();
const awarenesses = new Map();

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

io.on('connection', (socket) => {
    let socketRoom = null;
    let socketClientId = null;

    socket.on('join', ({ roomId, clientId }) => {
        socketRoom = roomId;
        socketClientId = clientId;
        socket.join(roomId);

        const doc = getDoc(roomId);
        socket.emit('sync', Y.encodeStateAsUpdate(doc));

        const awareness = getAwareness(roomId);
        const states = awareness.getStates();
        if (states.size > 0) {
            socket.emit('awareness', encodeAwarenessUpdate(awareness, [...states.keys()]));
        }
    });

    socket.on('update', ({ roomId, update }) => {
        Y.applyUpdate(getDoc(roomId), new Uint8Array(update));
        socket.to(roomId).emit('update', update);
    });

    socket.on('awareness', ({ roomId, update, clientId }) => {
        if (clientId != null) socketClientId = clientId;
        applyAwarenessUpdate(getAwareness(roomId), new Uint8Array(update), socket.id);
        socket.to(roomId).emit('awareness', update);
    });

    socket.on('disconnect', () => {
        if (socketRoom != null && socketClientId != null) {
            const awareness = getAwareness(socketRoom);
            removeAwarenessStates(awareness, [socketClientId], 'connection-closed');
            const removalUpdate = encodeAwarenessUpdate(awareness, [socketClientId]);
            io.to(socketRoom).emit('awareness', removalUpdate);
        }
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({ message: "ok", success: true });
});

httpServer.listen(3000, () => {
    console.log("Server is running on port 3000");
});
