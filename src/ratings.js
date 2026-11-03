// Overall rating (0-100) for each leaderboard. Pure JS, no React, so it can be tested in node.
//
// Every stat is min-max normalised across the players being rated (X' = (X - min) / (max - min)),
// stats where lower is better are flipped (1 - X'), then the weights below are applied.
// Totals are turned into per-match / per-over rates first so playing more doesn't beat playing well.

// A player needs this much data before they are rated, so one lucky innings can't top the board.
// If fewer than 2 players qualify yet, everyone with data is rated instead (see `relaxed`).
export const MIN = { batting: 3, bowling: 5, fielding: 3 }; // innings / overs bowled / matches
export const MIN_LABEL = { batting: 'innings', bowling: 'overs', fielding: 'matches' };

const W = {
  batting:  { average: 0.30, strikeRate: 0.25, highScore: 0.10, boundaryPct: 0.20, dotPct: 0.15 },
  bowling:  { wpm: 0.30, average: 0.20, economy: 0.25, dotPct: 0.15, epo: 0.10 },
  fielding: { cpm: 0.35, ropm: 0.25, catchPct: 0.25, dpm: 0.15 },
};

// metric: [weight key, how to read it, higher-is-better?]
// A missing value (null) means "can't be measured yet" and scores 0 on that part.
const METRICS = {
  batting: [
    // Never dismissed: average is undefined, so fall back to runs (the usual not-out convention).
    ['average',     (p) => p.batting.average ?? p.batting.runs, true],
    ['strikeRate',  (p) => p.batting.strikeRate, true],
    ['highScore',   (p) => p.batting.highScore, true],
    ['boundaryPct', (p) => p.batting.boundaryPct, true],
    ['dotPct',      (p) => p.batting.dotPct, false],
  ],
  bowling: [
    ['wpm',     (p) => p.bowling.matches > 0 ? p.bowling.wickets / p.bowling.matches : null, true],
    // No wickets: average is undefined, so it scores 0 on this part.
    ['average', (p) => p.bowling.average, false],
    ['economy', (p) => p.bowling.economy, false],
    ['dotPct',  (p) => p.bowling.dotPct, true],
    ['epo',     (p) => p.bowling.overs > 0 ? p.bowling.extras / p.bowling.overs : null, false],
  ],
  fielding: [
    ['cpm',      (p) => p.matches > 0 ? p.fielding.catches / p.matches : null, true],
    ['ropm',     (p) => p.matches > 0 ? p.fielding.runouts / p.matches : null, true],
    // No chances yet: nothing to judge reliability on, so it scores 0 on this part.
    ['catchPct', (p) => p.fielding.catchPct, true],
    ['dpm',      (p) => p.matches > 0 ? p.fielding.drops / p.matches : null, false],
  ],
};

// How much of the threshold a player has reached, in the section's own unit.
export const progress = (section, p) =>
  section === 'batting' ? p.batting.innings : section === 'bowling' ? p.bowling.overs : p.matches;

// Returns Map(name -> { score, qualified }) for players with data in this section.
// `score` is 0-100, or null when the player is below the minimum and isn't rated.
// Also returns `relaxed` (true when the minimum was waived because too few players meet it).
export function overallRatings(players, section, hasData) {
  const pool = players.filter(hasData);
  let rated = pool.filter((p) => progress(section, p) >= MIN[section]);
  const relaxed = rated.length < 2;
  if (relaxed) rated = pool;

  const out = new Map();
  for (const p of pool) out.set(p.name, { score: null, qualified: !relaxed && rated.includes(p) });
  if (!rated.length) return { map: out, relaxed };

  const metrics = METRICS[section];
  const ranges = metrics.map(([, get]) => {
    const vals = rated.map(get).filter((v) => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
  });

  for (const p of rated) {
    let total = 0;
    metrics.forEach(([key, get, high], i) => {
      const v = get(p), r = ranges[i];
      if (v == null || !r) return;                                          // unmeasurable: contributes 0
      const n = r[1] === r[0] ? 0.5 : (v - r[0]) / (r[1] - r[0]);           // no spread: neutral, same for everyone
      total += W[section][key] * (high ? n : 1 - n);
    });
    out.set(p.name, { score: Math.round(total * 1000) / 10, qualified: !relaxed });
  }
  return { map: out, relaxed };
}
