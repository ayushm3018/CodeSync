import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { redis, docKey } from '../infrastructure/redisClient.js';
import { SAVE_DEBOUNCE_MS } from '../config.js';
import * as chatService from './chatService.js';

const docs = new Map();
const awarenesses = new Map();
const saveTimers = new Map();

let ioRef = null;

export function init(io) {
    ioRef = io;
}

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

export async function ensureLoaded(roomId) {
    if (docs.has(roomId)) return;
    const bytes = await redis.getBuffer(docKey(roomId));
    const doc = new Y.Doc();
    if (bytes) Y.applyUpdate(doc, new Uint8Array(bytes));
    doc.on('update', (update, origin) => {
        scheduleSave(roomId);
        if (origin === 'server' && ioRef) {
            ioRef.to(roomId).emit('update', update);
        }
    });
    docs.set(roomId, doc);
    chatService.clearStaleStreamingFlags(doc);
    chatService.setupWatcher(roomId, doc);
}

export function getDoc(roomId) {
    return docs.get(roomId);
}

export function getAwareness(roomId) {
    let a = awarenesses.get(roomId);
    if (!a) {
        a = new Awareness(getDoc(roomId));
        awarenesses.set(roomId, a);
    }
    return a;
}

export function hasAwareness(roomId) {
    return awarenesses.has(roomId);
}

export function cleanup(roomId) {
    docs.delete(roomId);
    const a = awarenesses.get(roomId);
    if (a) a.destroy();
    awarenesses.delete(roomId);
    if (saveTimers.has(roomId)) {
        clearTimeout(saveTimers.get(roomId));
        saveTimers.delete(roomId);
    }
}
