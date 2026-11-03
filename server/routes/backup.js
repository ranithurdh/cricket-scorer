// Backup: download every saved match (and the saved players with their faces) as one JSON file, and read one back in.
// Importing only ever ADDS: matches already in the database (same id or same clientId) and players whose name is
// already saved are left alone, so it's safe to import the same file twice.
import express, { Router } from 'express';
import mongoose from 'mongoose';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import { loadRoster, rebuildSummaries, toBuffer } from '../roster.js';
import { summarize, validateMatch } from '../summarize.js';
import { cleanName, nameKey, NAME_MAX } from '../../src/members.js';

const router = Router();
const FORMAT = 'dorm-cricket-backup';
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PHOTO_LIMIT = 1024 * 1024;

router.get('/', async (_req, res, next) => {
  try {
    const [players, matches] = await Promise.all([
      Player.find().sort({ order: 1, _id: 1 }).lean(),
      Match.find().select('config events clientId playedAt createdAt').sort({ playedAt: 1 }).lean(),
    ]);
    const stamp = new Date();
    const body = {
      format: FORMAT, version: 1, exportedAt: stamp.toISOString(),
      players: players.map((p) => ({
        name: p.name, aliases: p.aliases ?? [], order: p.order ?? 0,
        photo: p.photo?.data ? { contentType: p.photo.contentType, data: toBuffer(p.photo.data).toString('base64') } : null,
      })),
      matches: matches.map((m) => ({
        id: String(m._id), clientId: m.clientId ?? null, playedAt: m.playedAt, createdAt: m.createdAt, config: m.config, events: m.events,
      })),
    };
    res.set('Content-Disposition', `attachment; filename="cricket-backup-${stamp.toISOString().slice(0, 10)}.json"`);
    res.json(body);
  } catch (err) { next(err); }
});

router.post('/import', express.json({ limit: '60mb' }), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b || b.format !== FORMAT || !Array.isArray(b.matches)) {
      return res.status(400).json({ error: "that doesn't look like a cricket backup file" });
    }
    const out = { addedMatches: 0, skippedMatches: 0, failedMatches: 0, addedPlayers: 0, skippedPlayers: 0 };

    // players first, so the new matches are scored against the full roster
    const takenKey = (key) => Player.exists({ $or: [{ nameKey: key }, { aliases: key }] });
    for (const p of Array.isArray(b.players) ? b.players : []) {
      const name = cleanName(p?.name);
      if (!name || name.length > NAME_MAX) { out.skippedPlayers += 1; continue; }
      const key = nameKey(name);
      if (await takenKey(key)) { out.skippedPlayers += 1; continue; }
      const aliases = [];
      for (const a of Array.isArray(p.aliases) ? p.aliases : []) {
        if (typeof a === 'string' && a && a !== key && !(await takenKey(a))) aliases.push(a);
      }
      const doc = { name, nameKey: key, aliases, order: Number.isFinite(p.order) ? p.order : 0 };
      const ph = p.photo;
      if (ph && PHOTO_TYPES.includes(ph.contentType) && typeof ph.data === 'string') {
        const data = Buffer.from(ph.data, 'base64');
        if (data.length && data.length <= PHOTO_LIMIT) doc.photo = { data, contentType: ph.contentType, updatedAt: new Date() };
      }
      try { await Player.create(doc); out.addedPlayers += 1; } catch { out.skippedPlayers += 1; }
    }

    const roster = await loadRoster();
    const have = await Match.find().select('clientId').lean();
    const ids = new Set(have.map((m) => String(m._id)));
    const clientIds = new Set(have.map((m) => m.clientId).filter(Boolean));

    const docs = [];
    for (const m of b.matches) {
      const id = mongoose.isValidObjectId(m?.id) ? String(m.id) : null;
      const clientId = typeof m?.clientId === 'string' && m.clientId ? m.clientId : null;
      if ((id && ids.has(id)) || (clientId && clientIds.has(clientId))) { out.skippedMatches += 1; continue; }
      if (validateMatch({ config: m?.config, events: m?.events })) { out.failedMatches += 1; continue; }
      try {
        const doc = { config: m.config, events: m.events, ...summarize(m.config, m.events, roster) };
        if (id) { doc._id = id; ids.add(id); }
        if (clientId) { doc.clientId = clientId; clientIds.add(clientId); }
        const played = new Date(m.playedAt);
        if (!Number.isNaN(played.getTime())) doc.playedAt = played;
        docs.push(doc);
      } catch { out.failedMatches += 1; }
    }
    if (docs.length) {
      const r = await Match.insertMany(docs, { ordered: false }).catch((e) => e.insertedDocs ?? []);
      out.addedMatches = Array.isArray(r) ? r.length : docs.length;
      out.failedMatches += docs.length - out.addedMatches;
    }
    if (out.addedPlayers) await rebuildSummaries(await loadRoster()); // older matches now have a row for the new people
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
