// Career totals per dorm member, built from the playerStats rows saved on each completed match.
// Plain JS (not a Mongo pipeline): a dorm's worth of matches is tiny, and this is easy to test.
import { DEFAULT_ROSTER } from '../src/members.js';

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const div = (n, d) => (d > 0 ? Math.round((n / d) * 100) / 100 : null);

const blank = (name, photo) => ({
  name, photo, matches: 0, wins: 0, losses: 0,
  t: { innings: 0, dismissals: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, highScore: 0,
       bMatches: 0, bBalls: 0, bOvers: 0, bRuns: 0, wickets: 0, bDots: 0, extras: 0, catches: 0, runouts: 0, drops: 0 },
});

// `roster` is the saved players (see makeRoster); each one carries the photo URL shown in the leaderboard circle.
export function aggregatePlayers(matches, roster = DEFAULT_ROSTER) {
  // Every saved player always appears, even before they've played, so the leaderboard lists everyone.
  const byKey = new Map(roster.list.map((e) => [e.key, blank(e.name, e.photo ?? null)]));

  for (const m of matches) {
    for (const p of m.playerStats ?? []) {
      const entry = roster.byKey.get(p.nameKey); // also matches a player's old name after a rename
      const acc = entry && byKey.get(entry.key);
      if (!acc) continue; // guests / anyone not on the roster
      const t = acc.t, bat = p.batting ?? {}, bowl = p.bowling ?? {}, f = p.fielding ?? {};
      acc.matches += 1;
      if (p.won === true) acc.wins += 1;
      if (p.won === false) acc.losses += 1;
      if (bat.batted) {
        t.innings += 1;
        if (bat.out) t.dismissals += 1;
        t.highScore = Math.max(t.highScore, bat.runs ?? 0);
      }
      t.runs += bat.runs ?? 0; t.balls += bat.balls ?? 0; t.fours += bat.fours ?? 0;
      t.sixes += bat.sixes ?? 0; t.dots += bat.dots ?? 0;
      if ((bowl.balls ?? 0) > 0) t.bMatches += 1;               // matches where they actually bowled
      t.bBalls += bowl.balls ?? 0; t.bOvers += bowl.oversEq ?? 0; t.bRuns += bowl.runs ?? 0;
      t.wickets += bowl.wickets ?? 0; t.bDots += bowl.dots ?? 0; t.extras += bowl.extras ?? 0;
      t.catches += f.catches ?? 0; t.runouts += f.runouts ?? 0; t.drops += f.drops ?? 0;
    }
  }

  return [...byKey.values()].map(({ t, ...a }) => ({
    ...a,
    batting: {
      innings: t.innings, notOuts: t.innings - t.dismissals, runs: t.runs, balls: t.balls,
      fours: t.fours, sixes: t.sixes, highScore: t.innings ? t.highScore : null,
      average: div(t.runs, t.dismissals),                       // runs per dismissal
      strikeRate: pct(t.runs, t.balls) === null ? null : Math.round((t.runs / t.balls) * 10000) / 100,
      boundaryPct: pct(t.fours + t.sixes, t.balls),             // share of balls faced hit for 4 or 6
      dotPct: pct(t.dots, t.balls),                             // share of balls faced with no runs off the bat
    },
    bowling: {
      matches: t.bMatches, balls: t.bBalls, overs: Math.round(t.bOvers * 10) / 10, runs: t.bRuns, wickets: t.wickets,
      average: div(t.bRuns, t.wickets),                         // runs conceded per wicket
      economy: div(t.bRuns, t.bOvers),                          // runs per over
      dotPct: pct(t.bDots, t.bBalls),                           // share of legal balls with no runs at all
      extras: t.extras,                                         // runs from wides and no-balls
    },
    fielding: {
      catches: t.catches, runouts: t.runouts, drops: t.drops,
      catchPct: pct(t.catches, t.catches + t.drops),
    },
  }));
}
