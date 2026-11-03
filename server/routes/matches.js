import { Router } from 'express';
import mongoose from 'mongoose';
import Match from '../models/Match.js';
import { summarize, validateMatch } from '../summarize.js';
import { loadRoster } from '../roster.js';
import { scorecard } from '../scorecard.js';
import { auth } from '../auth.js';
import { bumpStats } from '../statsCache.js';
import { randomUUID } from 'node:crypto';

const router = Router();

const LIST_FIELDS = 'clientId status result winner teams innings playedAt createdAt updatedAt abandoned';

// Re-derive the summary from config + events; returns { error } if the payload is unusable.
function build(body, roster) {
  const problem = validateMatch(body);
  if (problem) return { error: problem };
  try {
    return { doc: { config: body.config, events: body.events, ...summarize(body.config, body.events, roster) } };
  } catch (err) {
    return { error: `could not score this match: ${err.message}` };
  }
}

const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ error: 'invalid match id' });

// Create. If clientId already exists this updates that match instead (safe to retry / autosave).
router.post('/', auth.requireRole('scorer'), async (req, res, next) => {
  try {
    const { doc, error } = build(req.body, await loadRoster());
    if (error) return res.status(400).json({ error });
    const { clientId, playedAt } = req.body;
    if (playedAt) doc.playedAt = new Date(playedAt);
    if (doc.status === 'completed') doc.abandoned = false; // finishing a match un-abandons it

    if (clientId) {
      const before = await Match.findOne({ clientId: String(clientId) }).select('status').lean();
      const saved = await Match.findOneAndUpdate(
        { clientId: String(clientId) },
        { $set: doc, $setOnInsert: { clientId: String(clientId) } },
        { upsert: true, new: true, runValidators: true },
      );
      if (before?.status === 'completed' || saved.status === 'completed') await bumpStats(); // only finished matches feed the stats
      return res.status(200).json(saved);
    }
    const created = await Match.create(doc);
    if (created.status === 'completed') await bumpStats();
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// List (no ball-by-ball data). ?status=completed&team=Name&limit=20&page=1
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const filter = {};
    if (['in_progress', 'completed'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.team) filter.teams = String(req.query.team);
    if (req.query.player) filter['playerStats.nameKey'] = String(req.query.player).trim().toLowerCase();

    const [matches, total] = await Promise.all([
      Match.find(filter).select(LIST_FIELDS).sort({ playedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Match.countDocuments(filter),
    ]);
    res.json({ matches, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// Scorecards for the Matches page, newest first: winner + members, every batter's runs (balls) and every bowler's figures.
// Finished matches plus any started one that has at least one ball. ?limit=20&page=1
router.get('/cards', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const filter = { $or: [{ status: 'completed' }, { 'events.type': 'ball' }] };
    // Home asks to leave out matches the admin marked abandoned; the Matches page still lists them
    if (req.query.hideAbandoned) filter.abandoned = { $ne: true };
    const [docs, total, roster] = await Promise.all([
      Match.find(filter).select('config events status playedAt abandoned').sort({ playedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Match.countDocuments(filter),
      loadRoster(),
    ]);
    const matches = docs.flatMap((m) => {
      try { return [{ id: String(m._id), status: m.status, abandoned: !!m.abandoned, playedAt: m.playedAt, ...scorecard(m.config, m.events, roster) }]; } catch { return []; }
    });
    res.json({ matches, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// Full match: config, events, and player stats.
router.get('/:id', validId, async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id).lean();
    match ? res.json(match) : res.status(404).json({ error: 'match not found' });
  } catch (err) { next(err); }
});

// Replace config/events (e.g. after an undo or a scoring correction); summary is recomputed.
router.put('/:id', auth.requireRole('scorer'), validId, async (req, res, next) => {
  try {
    const { doc, error } = build(req.body, await loadRoster());
    if (error) return res.status(400).json({ error });
    if (req.body.playedAt) doc.playedAt = new Date(req.body.playedAt);
    if (doc.status === 'completed') doc.abandoned = false;
    const before = await Match.findById(req.params.id).select('status').lean();
    const saved = await Match.findByIdAndUpdate(req.params.id, { $set: doc }, { new: true, runValidators: true });
    if (!saved) return res.status(404).json({ error: 'match not found' });
    if (before?.status === 'completed' || saved.status === 'completed') await bumpStats();
    res.json(saved);
  } catch (err) { next(err); }
});

router.delete('/:id', auth.requireRole('admin'), validId, async (req, res, next) => {
  try {
    const gone = await Match.findByIdAndDelete(req.params.id);
    if (!gone) return res.status(404).json({ error: 'match not found' });
    if (gone.status === 'completed') await bumpStats();
    res.json({ deleted: req.params.id });
  } catch (err) { next(err); }
});

// Admin: change when a match was played.
router.patch('/:id/date', auth.requireRole('admin'), validId, async (req, res, next) => {
  try {
    const d = new Date(req.body?.playedAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'that is not a valid date' });
    const saved = await Match.findByIdAndUpdate(req.params.id, { $set: { playedAt: d } }, { new: true }).select('status playedAt');
    if (!saved) return res.status(404).json({ error: 'match not found' });
    if (saved.status === 'completed') await bumpStats();
    res.json({ id: req.params.id, playedAt: saved.playedAt });
  } catch (err) { next(err); }
});

// Admin: mark an unfinished match abandoned (it leaves the Home page) or bring it back. Finished matches can't be abandoned.
router.post('/:id/abandon', auth.requireRole('admin'), validId, async (req, res, next) => {
  try {
    const abandoned = req.body?.abandoned !== false;
    const m = await Match.findById(req.params.id).select('status');
    if (!m) return res.status(404).json({ error: 'match not found' });
    if (m.status === 'completed') return res.status(400).json({ error: "a finished match can't be abandoned" });
    m.abandoned = abandoned;
    await m.save();
    res.json({ id: req.params.id, abandoned });
  } catch (err) { next(err); }
});

// Admin: hand the full match back so it can be opened in the scorer to correct it. Makes sure it has a clientId,
// because that is what the scorer's autosave uses to update this same match instead of creating a new one.
router.post('/:id/reopen', auth.requireRole('admin'), validId, async (req, res, next) => {
  try {
    const m = await Match.findById(req.params.id).select('config events clientId playedAt');
    if (!m) return res.status(404).json({ error: 'match not found' });
    if (!m.clientId) { m.clientId = randomUUID(); await m.save(); }
    res.json({ id: String(m._id), clientId: m.clientId, config: m.config, events: m.events, playedAt: m.playedAt });
  } catch (err) { next(err); }
});

export default router;
