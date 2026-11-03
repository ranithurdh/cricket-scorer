import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import matches from './routes/matches.js';
import stats from './routes/stats.js';
import settings from './routes/settings.js';
import players from './routes/players.js';
import backup from './routes/backup.js';
import authRoutes from './routes/auth.js';
import { auth, usingDefaultPasswords } from './auth.js';
import { seedPlayers, loadRoster } from './roster.js';
import { bumpOnWrite, ensureFacts } from './statsCache.js';

// Local MongoDB (what Compass connects to) by default. To move to Atlas, just set MONGODB_URI in .env.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dorm-cricket';
const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use('/api/backup', auth.requireRole('admin'), bumpOnWrite, backup); // admin only   // before the JSON parser below: backups can be much bigger than one match
app.use(express.json({ limit: '5mb' })); // event logs are small, but a long match adds up

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, db: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] }));
app.use('/api/auth', authRoutes);
app.use('/api/matches', matches); // reading is public; saving needs scorer, deleting needs admin (see the route file)
app.use('/api/stats', stats);
app.use('/api/settings', auth.writes('admin'), settings); // image uploads use their own raw-body parser
app.use('/api/players', auth.writes('admin'), bumpOnWrite, players);   // saved players + their faces

// After `npm run build`, this same server also serves the app (so it can be installed as a PWA from one https address).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const serveApp = fs.existsSync(path.join(dist, 'index.html'));
if (serveApp) {
  app.get('/sw.js', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'sw.js')); });
  app.use(express.static(dist));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
if (serveApp) app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'))); // single-page app fallback

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'upload is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const { host, name } = mongoose.connection;
  console.log(`MongoDB connected: ${host}/${name}`);
  if (usingDefaultPasswords) console.warn('WARNING: ADMIN_PASSWORD / SCORER_PASSWORD are not both set in .env, so the defaults (admin / scorer) are in use. Set your own.');
  await seedPlayers(); // first run: copy the default 8 members into the database
  const filled = await ensureFacts(await loadRoster()); // matches saved before the stored-facts change get theirs once
  if (filled) console.log(`Stored the stats facts for ${filled} match(es).`);
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
} catch (err) {
  console.error(`Could not connect to MongoDB at ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n${err.message}`);
  console.error('Is MongoDB running? (Compass: connect to mongodb://localhost:27017)');
  process.exit(1);
}
