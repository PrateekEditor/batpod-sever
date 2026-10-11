/**
 * A small fixed-window rate limiter, per IP, in memory.
 *
 * Enough to stop a script hammering signup or login from one address. It is
 * per serverless instance, so a determined attacker spread across instances
 * gets more than the nominal allowance - this is a speed bump, not a wall,
 * and it costs nothing. Vercel's own protections sit in front of it.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many attempts. Try again in a few minutes.' } = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size < 5000) return;
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }

  return function limiter(req, res, next) {
    const now = Date.now();
    const ip = (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';
    const key = `${ip}:${req.path}`;
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    prune(now);
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

module.exports = { rateLimit };
