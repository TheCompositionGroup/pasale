// Fixed-window limiter in memory. Keys are never logged. State resets on restart
// and is per instance (per isolate on Cloudflare), so the limit is approximate.
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    allow(key) {
      const t = now();
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      const entry = hits.get(key);
      if (!entry || entry.reset <= t) {
        hits.set(key, { count: 1, reset: t + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}
