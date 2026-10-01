/**
 * Placeholder gate for the admin routes until real login lands.
 *
 * The admin app sends `x-admin-key`; this compares it to ADMIN_KEY in the
 * environment. It is deliberately simple, and it is NOT user authentication:
 * anyone holding the key is an admin. Keep the key out of the client bundle,
 * rotate it if it leaks, and replace this whole file when you add real sessions.
 */
function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_KEY;

  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_KEY is not configured on the server.' });
  }

  const provided = req.get('x-admin-key');
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Admin key missing or incorrect.' });
  }

  next();
}

module.exports = adminAuth;
