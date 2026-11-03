// Rebuilds the derived stats on every saved match from its config + events.
// Run after changing how stats are calculated:  npm run recompute
import 'dotenv/config';
import mongoose from 'mongoose';
import Match from './models/Match.js';
import { summarize } from './summarize.js';
import { loadRoster, seedPlayers } from './roster.js';
import { bumpStats } from './statsCache.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dorm-cricket';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

await seedPlayers();
const roster = await loadRoster(); // who counts as a dorm member comes from the saved players

let ok = 0, failed = 0;
for (const m of await Match.find()) {
  try {
    m.set(summarize(m.config, m.events, roster));
    await m.save();
    ok += 1;
  } catch (err) {
    failed += 1;
    console.warn(`skipped ${m._id}: ${err.message}`);
  }
}
await bumpStats(); // the saved Leaderboards / Home / 1v1 results are rebuilt on next view
console.log(`Recomputed ${ok} match(es)${failed ? `, ${failed} skipped` : ''}.`);
await mongoose.disconnect();
