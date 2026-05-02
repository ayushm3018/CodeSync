import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as Y from 'yjs';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const docs = new Map();

function getDoc(roomId) {
    let doc = docs.get(roomId);
    if (!doc) {
        doc = new Y.Doc();
        docs.set(roomId, doc);
    }
    return doc;
}

io.on('connection', (socket) => {
    socket.on('join', (roomId) => {
        socket.join(roomId);
        const doc = getDoc(roomId);
        socket.emit('sync', Y.encodeStateAsUpdate(doc));
    });

    socket.on('update', ({ roomId, update }) => {
        const doc = getDoc(roomId);
        Y.applyUpdate(doc, new Uint8Array(update));
        socket.to(roomId).emit('update', update);
    });

    socket.on('awareness', ({ roomId, update }) => {
        socket.to(roomId).emit('awareness', update);
    });
});

app.get("/", (req, res) => {
    res.status(200).json({ message: "Server is running", success: true });
});

app.get("/health", (req, res) => {
    res.status(200).json({ message: "ok", success: true });
});

httpServer.listen(3000, () => {
    console.log("Server is running on port 3000");
});
