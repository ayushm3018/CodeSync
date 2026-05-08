import { PISTON_LANGS, PISTON_URL } from '../config.js';

const versions = {};

export async function loadRuntimes() {
    const maxAttempts = 15;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${PISTON_URL}/runtimes`);
            const data = await res.json();
            for (const [ourLang, pistonLang] of Object.entries(PISTON_LANGS)) {
                const m = data.find((r) => r.language === pistonLang);
                if (m) versions[ourLang] = m.version;
            }
            console.log(`[piston] loaded ${Object.keys(versions).length} runtimes`);
            return;
        } catch (err) {
            if (attempt === maxAttempts) {
                console.error('[piston] runtimes load failed after retries:', err.message);
                return;
            }
            console.warn(`[piston] load attempt ${attempt}/${maxAttempts} failed (${err.message}), retrying in 2s`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
}

export function getVersion(language) {
    return versions[language];
}

export function isRunnable(language) {
    return Boolean(versions[language]);
}

export async function execute(language, code, stdin = '') {
    const version = versions[language];
    if (!version) throw new Error(`Language "${language}" cannot be executed`);

    const res = await fetch(`${PISTON_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            language: PISTON_LANGS[language],
            version,
            files: [{ content: code }],
            stdin,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Piston returned HTTP ${res.status}`);

    return {
        stdout: data.run?.stdout || '',
        stderr: data.run?.stderr || '',
        exitCode: data.run?.code ?? null,
        compileStderr: data.compile?.stderr || '',
    };
}
