import * as Y from 'yjs';
import {
    applyAwarenessUpdate,
    encodeAwarenessUpdate,
    removeAwarenessStates,
} from 'y-protocols/awareness';
import * as roomService from '../services/roomService.js';
import * as docService from '../services/docService.js';
import * as executionService from '../services/executionService.js';

const roomClients = new Map();

export function register(io) {
    io.on('connection', (socket) => {
        let socketRoom = null;
        let socketClientId = null;

        socket.on('join', async ({ roomId, clientId }) => {
            const room = roomService.markJoined(roomId);
            if (!room) {
                socket.emit('room-error', { message: 'Room not found' });
                socket.disconnect(true);
                return;
            }
            socketRoom = roomId;
            socketClientId = clientId;
            socket.join(roomId);

            if (!roomClients.has(roomId)) roomClients.set(roomId, new Map());
            roomClients.get(roomId).set(clientId, socket);

            await docService.ensureLoaded(roomId);

            socket.emit('room-info', { id: roomId, creator: room.creator });

            const doc = docService.getDoc(roomId);
            socket.emit('sync', Y.encodeStateAsUpdate(doc));

            const awareness = docService.getAwareness(roomId);
            const states = awareness.getStates();
            if (states.size > 0) {
                socket.emit('awareness', encodeAwarenessUpdate(awareness, [...states.keys()]));
            }
        });

        socket.on('update', async ({ roomId, update }) => {
            if (!roomService.exists(roomId)) return;
            await docService.ensureLoaded(roomId);
            Y.applyUpdate(docService.getDoc(roomId), new Uint8Array(update));
            socket.to(roomId).emit('update', update);
        });

        socket.on('awareness', async ({ roomId, update, clientId }) => {
            if (!roomService.exists(roomId)) return;
            await docService.ensureLoaded(roomId);
            if (clientId != null) socketClientId = clientId;
            applyAwarenessUpdate(docService.getAwareness(roomId), new Uint8Array(update), socket.id);
            socket.to(roomId).emit('awareness', update);
        });

        socket.on('run', async ({ roomId, runBy, stdin }) => {
            if (!roomService.exists(roomId)) return;
            const result = await executionService.runCode(roomId, runBy || 'unknown', stdin || '');
            if (!result.ok) socket.emit('run-error', { message: result.error });
        });

        socket.on('kick', ({ roomId, targetClientId, kickBy }) => {
            const room = roomService.get(roomId);
            if (!room || room.creator !== kickBy) return;
            const clients = roomClients.get(roomId);
            if (!clients) return;
            const targetSocket = clients.get(targetClientId);
            if (!targetSocket) return;
            targetSocket.emit('kicked', { message: 'You were removed by the room creator.' });
            targetSocket.disconnect(true);
        });

        socket.on('disconnect', () => {
            if (!socketRoom) return;
            if (!roomService.exists(socketRoom)) return;

            if (socketClientId != null) {
                const clients = roomClients.get(socketRoom);
                if (clients) {
                    clients.delete(socketClientId);
                    if (clients.size === 0) roomClients.delete(socketRoom);
                }
            }

            if (socketClientId != null && docService.hasAwareness(socketRoom)) {
                const awareness = docService.getAwareness(socketRoom);
                removeAwarenessStates(awareness, [socketClientId], 'connection-closed');
                const removalUpdate = encodeAwarenessUpdate(awareness, [socketClientId]);
                io.to(socketRoom).emit('awareness', removalUpdate);
            }

            roomService.markLeft(socketRoom);
        });
    });
}
