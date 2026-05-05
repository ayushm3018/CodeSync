import * as Y from 'yjs';
import * as aiService from '../infrastructure/aiService.js';
import { CHAT_HISTORY_LIMIT, STREAM_FLUSH_MS } from '../config.js';
import { generateMessageId } from '../utils/ids.js';

const chatBusy = new Map();

const getChat = (doc) => doc.getArray('chat');

function chatNeedsResponse(yChat) {
    let users = 0;
    let assistants = 0;
    yChat.forEach((m) => {
        const role = m.get('role');
        if (role === 'user') users++;
        else if (role === 'assistant') assistants++;
    });
    return users > assistants;
}

function buildPrompt(doc) {
    const code = doc.getText('monaco').toString() || '(editor is empty)';
    const yChat = getChat(doc);
    const recent = yChat.toArray().slice(-CHAT_HISTORY_LIMIT);
    const latestUser = recent[recent.length - 1];
    const history = recent
        .slice(0, -1)
        .map((m) => {
            const role = m.get('role');
            const speaker = role === 'user' ? m.get('username') : 'CodeAssist';
            return `${speaker}: ${m.get('content')}`;
        })
        .join('\n\n');

    return [
        `Current code in the editor:\n\`\`\`\n${code}\n\`\`\``,
        history ? `Recent conversation:\n${history}` : null,
        `New question from ${latestUser.get('username')}:\n${latestUser.get('content')}`,
    ]
        .filter(Boolean)
        .join('\n\n');
}

async function generateResponse(roomId, doc) {
    if (!aiService.isAvailable()) {
        console.warn(`[room ${roomId}] AI not configured — skipping`);
        return;
    }
    const yChat = getChat(doc);
    const prompt = buildPrompt(doc);

    let msg;
    doc.transact(() => {
        msg = new Y.Map();
        msg.set('id', generateMessageId('ai'));
        msg.set('role', 'assistant');
        msg.set('username', 'CodeAssist');
        msg.set('content', '');
        msg.set('streaming', true);
        msg.set('timestamp', Date.now());
        yChat.push([msg]);
    }, 'server');

    let accumulated = '';
    let lastFlush = 0;
    const flush = () => {
        doc.transact(() => msg.set('content', accumulated), 'server');
        lastFlush = Date.now();
    };

    try {
        for await (const chunk of aiService.streamResponse(prompt)) {
            accumulated += chunk;
            if (Date.now() - lastFlush > STREAM_FLUSH_MS) flush();
        }
        doc.transact(() => {
            msg.set('content', accumulated);
            msg.set('streaming', false);
        }, 'server');
    } catch (err) {
        console.error(`[room ${roomId}] AI error:`, err.message);
        doc.transact(() => {
            msg.set('content', accumulated || `_(CodeAssist hit an error: ${err.message})_`);
            msg.set('streaming', false);
        }, 'server');
    }
}

export function setupWatcher(roomId, doc) {
    const yChat = getChat(doc);
    const handler = async () => {
        if (chatBusy.get(roomId)) return;
        if (!chatNeedsResponse(yChat)) return;
        chatBusy.set(roomId, true);
        try {
            while (chatNeedsResponse(yChat)) {
                await generateResponse(roomId, doc);
            }
        } finally {
            chatBusy.set(roomId, false);
        }
    };
    yChat.observe(handler);
}

export function clearStaleStreamingFlags(doc) {
    const yChat = getChat(doc);
    const stale = [];
    yChat.forEach((m) => {
        if (m.get('streaming')) stale.push(m);
    });
    if (stale.length === 0) return;
    doc.transact(() => {
        for (const m of stale) m.set('streaming', false);
    }, 'server');
}

export function cleanup(roomId) {
    chatBusy.delete(roomId);
}
