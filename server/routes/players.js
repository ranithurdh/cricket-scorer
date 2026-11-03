import { Router } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import Player from '../models/Player.js';
import { PLAYER_FIELDS, listPlayers, loadRoster, rebuildSummaries, shapePlayer, toBuffer } from '../roster.js';
import { cleanName, nameKey, NAME_MAX } from '../../src/members.js';

const router = Router();

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PHOTO_LIMIT = 1024 * 1024; // the browser crops faces to 256px, so real uploads are ~30 KB

const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ error: 'invalid player id' });

function checkName(raw) {
  const name = cleanName(raw);
  if (!name) return { error: 'enter a name' };
  if (name.length > NAME_MAX) return { error: `names can be at most ${NAME_MAX} characters` };
  return { name };
}

// A name is taken if it's anyone's current name or an old name that still carries their history.
const taken = (key, exceptId) =>
  Player.exists({ $or: [{ nameKey: key }, { aliases: key }], ...(exceptId ? { _id: { $ne: exceptId } } : {}) });

const rebuild = async () => rebuildSummaries(await loadRoster());

// All saved players (no image bytes, just a versioned photo URL).
router.get('/', async (_req, res, next) => {
  try { res.json({ players: await listPlayers() }); } catch (err) { next(err); }
});

// Add a player.
router.post('/', async (req, res, next) => {
  try {
    const { name, error } = checkName(req.body?.name);
    if (error) return res.status(400).json({ error });
    const key = nameKey(name);
    if (await taken(key)) return res.status(409).json({ error: `${name} is already saved` });
    const last = await Player.findOne().sort({ order: -1 }).select('order').lean();
    const doc = await Player.create({ name, nameKey: key, order: (last?.order ?? -1) + 1 });
    await rebuild(); // their earlier matches start counting straight away
    res.status(201).json(shapePlayer(doc));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'that name is already saved' });
    next(err);
  }
});

// Rename. The old name becomes an alias so their past matches keep counting.
router.put('/:id', validId, async (req, res, next) => {
  try {
    const { name, error } = checkName(req.body?.name);
    if (error) return res.status(400).json({ error });
    const current = await Player.findById(req.params.id).select('name nameKey aliases').lean();
    if (!current) return res.status(404).json({ error: 'player not found' });
    const key = nameKey(name);
    const set = { name };
    if (key !== current.nameKey) {
      if (await taken(key, current._id)) return res.status(409).json({ error: `${name} is already saved` });
      set.nameKey = key;
      set.aliases = [...new Set([...(current.aliases ?? []), current.nameKey])].filter((k) => k !== key);
    }
    const saved = await Player.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).select(PLAYER_FIELDS);
    await rebuild();
    res.json(shapePlayer(saved));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'that name is already saved' });
    next(err);
  }
});

// Delete. Their matches stay in the database; adding the same name again brings the stats back.
router.delete('/:id', validId, async (req, res, next) => {
  try {
    const gone = await Player.findByIdAndDelete(req.params.id).select('_id');
    if (!gone) return res.status(404).json({ error: 'player not found' });
    await rebuild();
    res.json({ deleted: req.params.id });
  } catch (err) { next(err); }
});

// The face. The URL carries ?v=, so a new upload gets a new URL and browsers can cache it for good.
router.get('/:id/photo', validId, async (req, res, next) => {
  try {
    const p = await Player.findById(req.params.id).select('photo').lean();
    if (!p?.photo?.data) return res.status(404).json({ error: 'no photo' });
    res.set('Content-Type', p.photo.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(toBuffer(p.photo.data));
  } catch (err) { next(err); }
});

router.put('/:id/photo', validId, express.raw({ type: () => true, limit: PHOTO_LIMIT }), async (req, res, next) => {
  try {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!PHOTO_TYPES.includes(type)) return res.status(400).json({ error: 'upload a PNG, JPEG or WebP image' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'empty upload' });
    const saved = await Player.findByIdAndUpdate(
      req.params.id,
      { $set: { photo: { data: req.body, contentType: type, updatedAt: new Date() } } },
      { new: true },
    ).select(PLAYER_FIELDS);
    if (!saved) return res.status(404).json({ error: 'player not found' });
    res.json(shapePlayer(saved));
  } catch (err) { next(err); }
});

router.delete('/:id/photo', validId, async (req, res, next) => {
  try {
    const saved = await Player.findByIdAndUpdate(req.params.id, { $unset: { photo: '' } }, { new: true }).select(PLAYER_FIELDS);
    if (!saved) return res.status(404).json({ error: 'player not found' });
    res.json(shapePlayer(saved));
  } catch (err) { next(err); }
});

export default router;
