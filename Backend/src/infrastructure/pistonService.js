import { PISTON_LANGS, PISTON_URL } from '../config.js';

const versions = {};

export async function loadRuntimes() {
    try {
        const res = await fetch(`${PISTON_URL}/runtimes`);
        const data = await res.json();
        for (const [ourLang, pistonLang] of Object.entries(PISTON_LANGS)) {
            const m = data.find((r) => r.language === pistonLang);
            if (m) versions[ourLang] = m.version;
        }
        console.log(`[piston] loaded ${Object.keys(versions).length} runtimes`);
    } catch (err) {
        console.error('[piston] runtimes load failed:', err.message);
    }
}

export function getVersion(language) {
    return versions[language];
}

export function isRunnable(language) {
    return Boolean(versions[language]);
}

export async function execute(language, code) {
    const version = versions[language];
    if (!version) throw new Error(`Language "${language}" cannot be executed`);

    const res = await fetch(`${PISTON_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            language: PISTON_LANGS[language],
            version,
            files: [{ content: code }],
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
