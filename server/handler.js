// The Vercel function body: make sure MongoDB is connected, then let the Express app answer.
import app from './app.js';
import { ready } from './db.js';

export default async function handler(req, res) {
  try {
    await ready();
  } catch (err) {
    console.error('database not reachable:', err.message);
    return res.status(503).json({ error: 'database not reachable: check MONGODB_URI and that Atlas allows connections from anywhere (0.0.0.0/0)' });
  }
  return app(req, res);
}
