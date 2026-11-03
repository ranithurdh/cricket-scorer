// Run the API (and the built app, if `npm run build` was run) on your own machine or server:  npm run server
// On Vercel this file isn't used: api/index.js wraps server/app.js instead.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { ready, MONGODB_URI } from './db.js';

const PORT = process.env.PORT || 5000;

// After `npm run build`, this same server also serves the app.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.get('/sw.js', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'sw.js')); });
  app.use(express.static(dist));
}

try {
  await ready();
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
} catch (err) {
  console.error(`Could not connect to MongoDB at ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n${err.message}`);
  console.error('Is MongoDB running? (Compass: connect to mongodb://localhost:27017)');
  process.exit(1);
}
