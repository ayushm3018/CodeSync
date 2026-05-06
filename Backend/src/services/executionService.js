import * as pistonService from '../infrastructure/pistonService.js';
import * as docService from './docService.js';
import { generateMessageId } from '../utils/ids.js';

const runBusy = new Map();

export async function runCode(roomId, runBy, stdin = '') {
    if (runBusy.get(roomId)) {
        return { ok: false, error: 'A run is already in progress' };
    }
    const doc = docService.getDoc(roomId);
    if (!doc) return { ok: false, error: 'Room not loaded' };

    const yMeta = doc.getMap('meta');
    const language = yMeta.get('language') || 'javascript';
    if (!pistonService.isRunnable(language)) {
        return { ok: false, error: `Language "${language}" cannot be executed` };
    }
    const code = doc.getText('monaco').toString();
    if (!code.trim()) {
        return { ok: false, error: 'Editor is empty' };
    }

    runBusy.set(roomId, true);
    const runId = generateMessageId('run');
    const startedAt = Date.now();

    doc.transact(() => {
        yMeta.set('run', { id: runId, status: 'running', language, runBy, startedAt });
    }, 'server');

    let result;
    try {
        const out = await pistonService.execute(language, code, stdin);
        result = {
            id: runId,
            status: 'done',
            language,
            runBy,
            startedAt,
            finishedAt: Date.now(),
            ...out,
        };
    } catch (err) {
        console.error(`[room ${roomId}] piston error:`, err.message);
        result = {
            id: runId,
            status: 'error',
            language,
            runBy,
            startedAt,
            finishedAt: Date.now(),
            error: err.message,
        };
    } finally {
        runBusy.delete(roomId);
    }

    doc.transact(() => yMeta.set('run', result), 'server');
    return { ok: true };
}

export function cleanup(roomId) {
    runBusy.delete(roomId);
}
