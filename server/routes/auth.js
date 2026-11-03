import { Router } from 'express';
import { auth } from '../auth.js';
import LoginFail from '../models/LoginFail.js';

const router = Router();

// Slow down password guessing: 8 wrong tries per address per 10 minutes (stored in MongoDB, so it holds on Vercel too).
const WINDOW = 10 * 60 * 1000, MAX = 8;
const tooMany = async (ip) => {
  const f = await LoginFail.findOne({ ip }).lean();
  return !!f && f.until > new Date() && f.n >= MAX;
};
const fail = async (ip) => {
  const f = await LoginFail.findOne({ ip }).lean();
  if (f && f.until > new Date()) await LoginFail.updateOne({ ip }, { $inc: { n: 1 } });
  else await LoginFail.updateOne({ ip }, { $set: { n: 1, until: new Date(Date.now() + WINDOW) } }, { upsert: true });
};

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown';
    if (await tooMany(ip)) return res.status(429).json({ error: 'too many wrong passwords, try again in a few minutes' });
    const role = auth.roleForPassword(typeof req.body?.password === 'string' ? req.body.password : '');
    if (!role) { await fail(ip); return res.status(401).json({ error: 'wrong password' }); }
    await LoginFail.deleteOne({ ip });
    res.json({ role, token: auth.sign(role) });
  } catch (err) { next(err); }
});

router.get('/me', (req, res) => res.json({ role: auth.roleOf(req) }));

export default router;
