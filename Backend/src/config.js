import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;

export const GRACE_PERIOD_MS = 30_000;
export const SAVE_DEBOUNCE_MS = 2_000;
export const CHAT_HISTORY_LIMIT = 10;
export const STREAM_FLUSH_MS = 80;

export const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
export const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
export const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const SYSTEM_PROMPT = `You are CodeAssist, an AI helper embedded inside a collaborative code editor.
Multiple users may be editing code together and asking you questions about it.
You can see the current code in the editor and the recent chat history.
Answer concisely. When discussing code, reference specific lines, functions, or variables when helpful.
Do not generate large blocks of code unless explicitly asked — your job is to explain and answer questions.`;

export const PISTON_URL = process.env.PISTON_URL || 'http://localhost:2000/api/v2';
export const PISTON_LANGS = {
    javascript: 'javascript',
    typescript: 'typescript',
    python: 'python',
    java: 'java',
    cpp: 'c++',
    c: 'c',
    csharp: 'csharp',
    go: 'go',
    rust: 'rust',
    ruby: 'ruby',
    php: 'php',
    swift: 'swift',
    kotlin: 'kotlin',
    shell: 'bash',
    sql: 'sqlite3',
};
