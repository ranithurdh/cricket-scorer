// Two roles, two passwords (set in .env):
//   scorer: can score matches.   admin: everything the scorer can, plus delete matches, Settings, players, backup/import.
// Logging in with a password returns a signed token the browser sends back with each request; the server checks it,
// so hiding buttons in the page is not what protects anything.
import crypto from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;
const b64 = (s) => Buffer.from(s).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b)); // constant time, whatever the lengths

export function makeAuth({ admin, scorer, secret, now = () => Date.now(), tokenDays = 30 }) {
  const key = secret || sha(`cricket|${admin}|${scorer}`); // changing a password signs everybody out
  const mac = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

  const sign = (role) => { const p = b64(JSON.stringify({ r: role, e: now() + tokenDays * DAY })); return `${p}.${mac(p)}`; };

  function verify(token) {
    if (typeof token !== 'string') return null;
    const [p, sig, extra] = token.split('.');
    if (!p || !sig || extra !== undefined || !same(sig, mac(p))) return null;
    try {
      const { r, e } = JSON.parse(Buffer.from(p, 'base64url').toString());
      return (r === 'admin' || r === 'scorer') && e > now() ? r : null;
    } catch { return null; }
  }

  // the admin password is checked first, so if both passwords were the same you'd be admin
  const roleForPassword = (pw) => (same(pw ?? '', admin) ? 'admin' : same(pw ?? '', scorer) ? 'scorer' : null);
  const roleOf = (req) => verify((req.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));

  const allows = { scorer: ['scorer', 'admin'], admin: ['admin'] };
  const requireRole = (min) => (req, res, next) => {
    const role = roleOf(req);
    if (role && allows[min].includes(role)) return next();
    res.status(role ? 403 : 401).json({ error: min === 'admin' ? 'the admin password is needed for this' : 'sign in with the scorer or admin password first' });
  };
  // let reads through, protect everything that changes data
  const writes = (min) => (req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : requireRole(min)(req, res, next));

  return { sign, verify, roleForPassword, roleOf, requireRole, writes };
}

const admin = process.env.ADMIN_PASSWORD || 'admin';
const scorer = process.env.SCORER_PASSWORD || 'scorer';
export const usingDefaultPasswords = !process.env.ADMIN_PASSWORD || !process.env.SCORER_PASSWORD;
export const auth = makeAuth({ admin, scorer, secret: process.env.AUTH_SECRET });
