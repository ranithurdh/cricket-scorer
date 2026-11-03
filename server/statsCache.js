// The stats pages (Leaderboards, Home, 1v1) are built from numbers stored on each match, and the finished
// result is saved too. A page only gets rebuilt after something it depends on changed, so scoring a new match
// never means redoing everything, and viewing a page when nothing changed is a single read.
import Match from './models/Match.js';
import { StatCache, StatMeta } from './models/StatCache.js';
import { FACTS_VERSION, matchFacts } from './facts.js';

const currentVersion = async () => (await StatMeta.findOne({ key: 'stats' }).lean())?.version ?? 0;

// Something the stats depend on changed: everything saved is now out of date.
export const bumpStats = () => StatMeta.updateOne({ key: 'stats' }, { $inc: { version: 1 } }, { upsert: true });

// Saved result if nothing changed since it was built, otherwise build it (and save it) now.
export async function cached(key, compute) {
  const version = await currentVersion(); // read first: a change during the build leaves the entry marked stale
  const hit = await StatCache.findOne({ key }).lean();
  if (hit && hit.version === version) return hit.value;
  const value = await compute();
  await StatCache.updateOne({ key }, { $set: { value, version, computedAt: new Date() } }, { upsert: true });
  return value;
}

// Matches saved before this existed (or by older maths) get their facts worked out once.
export async function ensureFacts(roster) {
  const stale = await Match.find({ factsVersion: { $ne: FACTS_VERSION } }).select('config events').lean();
  if (!stale.length) return 0;
  const ops = stale.map((m) => ({
    updateOne: { filter: { _id: m._id }, update: { $set: { facts: matchFacts(m.config, m.events, roster), factsVersion: FACTS_VERSION } } },
  }));
  await Match.bulkWrite(ops, { ordered: false });
  return ops.length;
}

// Express middleware for routes that change stats data (players, import): bump BEFORE the reply goes out,
// so the next page load can't be handed a stale saved result.
export const bumpOnWrite = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) return json(body);
    bumpStats().catch(() => {}).then(() => json(body));
    return res;
  };
  next();
};
