import { Router } from 'express';
import { auth } from '../auth.js';

const router = Router();

// Slow down password guessing: 8 wrong tries per address per 10 minutes.
const fails = new Map();
const WINDOW = 10 * 60 * 1000, MAX = 8;
const tooMany = (ip) => { const f = fails.get(ip); return !!f && f.until > Date.now() && f.n >= MAX; };
const fail = (ip) => { const f = fails.get(ip); fails.set(ip, f && f.until > Date.now() ? { n: f.n + 1, until: f.until } : { n: 1, until: Date.now() + WINDOW }); };

router.post('/login', (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'too many wrong passwords, try again in a few minutes' });
  const role = auth.roleForPassword(typeof req.body?.password === 'string' ? req.body.password : '');
  if (!role) { fail(req.ip); return res.status(401).json({ error: 'wrong password' }); }
  fails.delete(req.ip);
  res.json({ role, token: auth.sign(role) });
});

router.get('/me', (req, res) => res.json({ role: auth.roleOf(req) }));

export default router;
