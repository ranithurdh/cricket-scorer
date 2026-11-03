import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import matches from './routes/matches.js';
import stats from './routes/stats.js';
import settings from './routes/settings.js';
import players from './routes/players.js';
import backup from './routes/backup.js';
import authRoutes from './routes/auth.js';
import { auth } from './auth.js';
import { bumpOnWrite } from './statsCache.js';

// The Express app on its own (no listen, no database connect) so it runs both as `npm run server` and as a Vercel function.
const app = express();
app.set('trust proxy', true); // behind Vercel / a proxy, req.ip is the real visitor (used by the login limiter)
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

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'upload is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

export default app;
