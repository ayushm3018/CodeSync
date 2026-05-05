const PISTON_URL = process.env.PISTON_URL || 'http://localhost:2000/api/v2';

const LANGS = [
    'node', 'typescript', 'python', 'java', 'c++', 'c', 'csharp',
    'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'bash', 'sqlite3',
];

async function waitReady() {
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${PISTON_URL}/runtimes`);
            if (res.ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Piston not responding at ${PISTON_URL}`);
}

async function main() {
    console.log(`Targeting ${PISTON_URL}`);
    await waitReady();
    const res = await fetch(`${PISTON_URL}/packages`);
    const all = await res.json();

    for (const lang of LANGS) {
        const versions = all
            .filter((p) => p.language === lang)
            .map((p) => p.language_version)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const latest = versions[versions.length - 1];
        if (!latest) {
            console.log(`✗ ${lang}: not available`);
            continue;
        }
        process.stdout.write(`Installing ${lang}@${latest}... `);
        const resp = await fetch(`${PISTON_URL}/packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang, version: latest }),
        });
        const data = await resp.json();
        console.log(resp.ok ? '✓' : `✗ ${data.message || resp.status}`);
    }
    console.log('\nDone. Restart the backend to pick up the new runtimes.');
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
