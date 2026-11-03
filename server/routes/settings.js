import { Router } from 'express';
import express from 'express';
import Settings from '../models/Settings.js';

const router = Router();

// Images arrive as raw bytes (the browser already shrinks them), so no base64 bloat.
const MB = process.env.VERCEL ? 4 : 8; // Vercel functions accept at most ~4.5 MB per request
const FIELDS = { background: { limit: MB * 1024 * 1024 }, icon: { limit: 1 * 1024 * 1024 } };
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'];

const version = (img) => (img?.updatedAt ? img.updatedAt.getTime() : null);

// Where the images live + a version stamp so browsers refetch only when they change.
router.get('/', async (_req, res, next) => {
  try {
    const s = await Settings.findOne({ key: 'site' }).select('background.updatedAt icon.updatedAt background.contentType icon.contentType backgroundOpacity').lean();
    res.json({
      backgroundOpacity: s?.backgroundOpacity ?? 60,
      background: s?.background?.contentType ? `/api/settings/background?v=${version(s.background)}` : null,
      icon: s?.icon?.contentType ? `/api/settings/icon?v=${version(s.icon)}` : null,
    });
  } catch (err) { next(err); }
});

router.put('/opacity', async (req, res, next) => {
  try {
    const v = Number(req.body?.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return res.status(400).json({ error: 'opacity must be 0-100' });
    await Settings.findOneAndUpdate({ key: 'site' }, { $set: { backgroundOpacity: Math.round(v) } }, { upsert: true, setDefaultsOnInsert: true });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:name(background|icon)', async (req, res, next) => {
  try {
    const s = await Settings.findOne({ key: 'site' }).select(req.params.name).lean();
    const img = s?.[req.params.name];
    if (!img?.data) return res.status(404).json({ error: 'not set' });
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // URL carries ?v=, so a new upload gets a new URL
    const d = img.data; // lean() hands back a BSON Binary; unwrap it to plain bytes
    res.send(Buffer.isBuffer(d) ? d : Buffer.from(d.buffer.subarray(0, d.position ?? d.buffer.length)));
  } catch (err) { next(err); }
});

router.put('/:name(background|icon)', (req, res, next) => {
  const { limit } = FIELDS[req.params.name];
  express.raw({ type: () => true, limit })(req, res, next);
}, async (req, res, next) => {
  try {
    const name = req.params.name;
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'upload a PNG, JPEG, WebP, GIF or ICO image' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'empty upload' });
    await Settings.findOneAndUpdate(
      { key: 'site' },
      { $set: { [name]: { data: req.body, contentType: type, updatedAt: new Date() } } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:name(background|icon)', async (req, res, next) => {
  try {
    await Settings.updateOne({ key: 'site' }, { $unset: { [req.params.name]: '' } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
