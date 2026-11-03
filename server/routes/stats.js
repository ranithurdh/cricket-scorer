import { Router } from 'express';
import Match from '../models/Match.js';
import { aggregatePlayers } from '../aggregate.js';
import { loadRoster } from '../roster.js';
import { highlights } from '../highlights.js';
import { versus } from '../versus.js';
import { cached, ensureFacts } from '../statsCache.js';

const router = Router();

// Every result here is saved (see statsCache.js) and only rebuilt after a finished match, a player or an
// import changed something. Rebuilding adds up numbers stored on each match; it never replays the balls.

// Career stats for the saved players (the dorm members), from completed matches only
// (a half-scored match won't skew anything). Guests never appear.
router.get('/players', async (_req, res, next) => {
  try {
    res.json(await cached('players', async () => {
      const matches = await Match.find({ status: 'completed' }).select('playerStats').lean();
      return aggregatePlayers(matches, await loadRoster());
    }));
  } catch (err) { next(err); }
});

// Home page records: highest score, best spell, 50s, hat-tricks, six machine, ducks, partnership, most-won team.
router.get('/highlights', async (_req, res, next) => {
  try {
    res.json(await cached('highlights', async () => {
      const roster = await loadRoster();
      await ensureFacts(roster);
      const matches = await Match.find({ status: 'completed' })
        .select('config.ballsPerOver status teams winner playerStats playedAt createdAt facts').lean();
      return highlights(matches, roster);
    }));
  } catch (err) { next(err); }
});

// 1v1 page: ?player=Name -> maidens, stumpings, best figures and every matchup for that player.
router.get('/versus', async (req, res, next) => {
  try {
    const roster = await loadRoster();
    const me = roster.find(String(req.query.player ?? ''));
    if (!me) return res.status(404).json({ error: 'player not found' });
    res.json(await cached(`versus:${me.key}`, async () => {
      await ensureFacts(roster);
      const matches = await Match.find({ status: 'completed' })
        .select('config.ballsPerOver playerStats status playedAt createdAt facts').lean();
      return versus(matches, roster, me.name);
    }));
  } catch (err) { next(err); }
});

export default router;
