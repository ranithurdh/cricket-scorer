// Database connection + one-time startup work, shared by `npm run server` and the Vercel function.
// On Vercel a function instance can serve many requests, so this runs once per instance and later calls reuse it.
import mongoose from 'mongoose';
import { seedPlayers, loadRoster } from './roster.js';
import { ensureFacts } from './statsCache.js';
import { usingDefaultPasswords } from './auth.js';

// Local MongoDB (what Compass connects to) by default. To move to Atlas, just set MONGODB_URI.
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dorm-cricket';

export function ready() {
  const g = globalThis;
  g.__cricketReady ??= (async () => {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
    const { host, name } = mongoose.connection;
    console.log(`MongoDB connected: ${host}/${name}`);
    if (usingDefaultPasswords) console.warn('WARNING: ADMIN_PASSWORD / SCORER_PASSWORD are not both set, so the defaults (admin / scorer) are in use. Set your own.');
    try { await seedPlayers(); } catch (err) { if (err.code !== 11000) throw err; } // two cold starts seeding at once: the other one won
    const filled = await ensureFacts(await loadRoster()); // matches saved before the stored-facts change get theirs once
    if (filled) console.log(`Stored the stats facts for ${filled} match(es).`);
  })().catch((err) => { g.__cricketReady = null; throw err; }); // a failed start is retried on the next request
  return g.__cricketReady;
}
