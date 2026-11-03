// Saved players -> roster, plus the helpers that keep saved match stats in step with it.
import Player from './models/Player.js';
import Settings from './models/Settings.js';
import Match from './models/Match.js';
import { DEFAULT_MEMBERS, makeRoster, nameKey } from '../src/members.js';
import { summarize } from './summarize.js';

// Fields needed to describe a player without pulling the image bytes.
export const PLAYER_FIELDS = 'name nameKey aliases order photo.contentType photo.updatedAt';

export const photoUrl = (p) =>
  p.photo?.contentType ? `/api/players/${p._id}/photo?v=${p.photo.updatedAt ? new Date(p.photo.updatedAt).getTime() : 0}` : null;

export const shapePlayer = (p) => ({ id: String(p._id), name: p.name, aliases: [...(p.aliases ?? [])], photo: photoUrl(p) });

// lean() hands back a BSON Binary; unwrap it to plain bytes.
export const toBuffer = (d) => (Buffer.isBuffer(d) ? d : Buffer.from(d.buffer.subarray(0, d.position ?? d.buffer.length)));

export async function listPlayers() {
  const docs = await Player.find().select(PLAYER_FIELDS).sort({ order: 1, _id: 1 }).lean();
  return docs.map(shapePlayer);
}

export async function loadRoster() {
  return makeRoster(await listPlayers());
}

// First run only: copy the default 8 into the database. The flag stops them coming back if you delete them all.
export async function seedPlayers() {
  const s = await Settings.findOne({ key: 'site' }).select('playersSeeded').lean();
  if (s?.playersSeeded) return;
  if ((await Player.countDocuments()) === 0) {
    await Player.insertMany(DEFAULT_MEMBERS.map((name, i) => ({ name, nameKey: nameKey(name), order: i })));
  }
  await Settings.updateOne({ key: 'site' }, { $set: { playersSeeded: true } }, { upsert: true, setDefaultsOnInsert: true });
}

// Re-derive every saved match's player rows with the current roster. Needed when someone is added
// (old matches never had a row for them), renamed, or removed.
export async function rebuildSummaries(roster) {
  const ops = [];
  for await (const m of Match.find().select('config events').lean().cursor()) {
    try {
      const { playerStats, facts, factsVersion } = summarize(m.config, m.events, roster);
      ops.push({ updateOne: { filter: { _id: m._id }, update: { $set: { playerStats, facts, factsVersion } } } });
    } catch (err) {
      console.warn(`skipped ${m._id}: ${err.message}`);
    }
  }
  if (ops.length) await Match.bulkWrite(ops, { ordered: false });
  return ops.length;
}
