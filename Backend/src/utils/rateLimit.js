// Fixed-window counter per key, kept in memory (there's a single backend process).
export function createLimiter({ limit, windowMs }) {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (now - entry.start >= windowMs) hits.delete(key);
        }
    }, windowMs).unref();

    return (key) => {
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || now - entry.start >= windowMs) {
            hits.set(key, { start: now, count: 1 });
            return true;
        }
        entry.count++;
        return entry.count <= limit;
    };
}

// Caddy overwrites X-Forwarded-For with the real client IP, so the first entry is trustworthy
// in production. Locally there's no proxy and this falls back to the socket address.
export function clientIp(headers, fallback) {
    const forwarded = headers['x-forwarded-for'];
    return (forwarded && forwarded.split(',')[0].trim()) || fallback;
}
