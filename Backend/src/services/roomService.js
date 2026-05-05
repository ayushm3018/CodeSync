import { redis, metaKey, docKey } from '../infrastructure/redisClient.js';
import { GRACE_PERIOD_MS } from '../config.js';
import { generateRoomId } from '../utils/ids.js';
import * as docService from './docService.js';
import * as chatService from './chatService.js';
import * as executionService from './executionService.js';

const rooms = new Map();

export function exists(roomId) {
    return rooms.has(roomId);
}

export function get(roomId) {
    return rooms.get(roomId);
}

export async function createRoom(creator) {
    let roomId;
    do {
        roomId = generateRoomId();
    } while (rooms.has(roomId));
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
    return { id: roomId, creator: trimmed };
}

export function markJoined(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    if (room.deletionTimer) {
        clearTimeout(room.deletionTimer);
        room.deletionTimer = null;
        console.log(`[room ${roomId}] deletion cancelled`);
    }
    room.connectionCount++;
    return room;
}

export function markLeft(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.connectionCount = Math.max(0, room.connectionCount - 1);
    if (room.connectionCount === 0) {
        console.log(`[room ${roomId}] empty, deletion in ${GRACE_PERIOD_MS}ms`);
        room.deletionTimer = setTimeout(() => deleteRoom(roomId), GRACE_PERIOD_MS);
    }
}

async function deleteRoom(roomId) {
    rooms.delete(roomId);
    docService.cleanup(roomId);
    chatService.cleanup(roomId);
    executionService.cleanup(roomId);
    await redis.del(metaKey(roomId), docKey(roomId));
    console.log(`[room ${roomId}] deleted`);
}

export async function restoreFromRedis() {
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
