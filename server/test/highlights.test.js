// No-dependency check of the Home page records:  npm run test:highlights
import assert from 'node:assert/strict';
import { summarize } from '../summarize.js';
import { highlights } from '../highlights.js';
import { DEFAULT_ROSTER } from '../../src/members.js';
import { matchFacts } from '../facts.js';

const P = (key, names) => names.map((name, i) => ({ id: `${key}${i}`, name }));
const mk = (a, b) => ({
  wideRuns: 1, noBallRuns: 1, allowConsecutiveOvers: false, overs: 1, ballsPerOver: 12, battingFirst: 0, lastManBats: false,
  teams: [{ name: a, players: P('a', ['Ranithu', 'Sadaham', 'Nithil', 'Sandanu']) }, { name: b, players: P('b', ['Bhashika', 'Senuja', 'Oneth', 'Nadin']) }],
});
const config = mk('Reds', 'Blues');
const sel = (role, playerId) => ({ type: 'select', role, playerId });
const out = (outId, kind = 'bowled') => ({ type: 'ball', runs: 0, wicket: { outId, kind } });
const sixes = Array.from({ length: 9 }, () => ({ type: 'ball', runs: 6 }));
const make = (middle, id, cfg = config, winner = cfg.teams[0].name) => {
  const events = [sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b0'), ...sixes, out('a0'), ...middle, { type: 'ball', runs: 0 }];
  const s = summarize(cfg, events);
  return { _id: id, config: cfg, events, status: 'completed', teams: cfg.teams.map((t) => t.name), winner, playedAt: `2026-11-0${id}T10:00:00Z`, playerStats: s.playerStats };
};
const names = (xs) => xs.map((x) => x.name);

// Match 1: Ranithu 54 (nine sixes) then bowled; Nithil out for a duck next (a wide in between); not a hat-trick.
const m1 = make([sel('striker', 'a2'), { type: 'ball', runs: 0, extra: 'wide' }, out('a2')], 1);
let h = highlights([m1], DEFAULT_ROSTER);
assert.equal(h.highestScore.name, 'Ranithu'); assert.equal(h.highestScore.runs, 54);
assert.deepEqual(h.fifties.map((f) => [f.name, f.count, f.best]), [['Ranithu', 1, 54]]);
assert.deepEqual(h.hattricks, [], 'two wickets then a dot is not a hat-trick');
assert.deepEqual([h.sixMachine.sixes, names(h.sixMachine.players)], [9, ['Ranithu']]);
assert.deepEqual([h.mostDucks.ducks, names(h.mostDucks.players)], [1, ['Nithil']]);
assert.deepEqual(names(h.bestPartnership.players).sort(), ['Ranithu', 'Sadaham']);
assert.equal(h.bestPartnership.runs, 54, 'nine sixes while Ranithu and Sadaham were together');
assert.equal(h.bestPartnership.balls, 10);
assert.equal(h.bestSpell.name, 'Bhashika');

// Match 2: three in a row with a wide in between (doesn't break it) -> a hat-trick; Ranithu's 50s now count 2.
const m2 = make([sel('striker', 'a2'), out('a2'), { type: 'ball', runs: 0, extra: 'wide' }, sel('striker', 'a3'), out('a3')], 2);
h = highlights([m2, m1], DEFAULT_ROSTER);
assert.deepEqual(h.hattricks.map((x) => [x.name, x.count]), [['Bhashika', 1]]);
assert.deepEqual(h.fifties.map((x) => [x.name, x.count]), [['Ranithu', 2]]);
assert.deepEqual(h.sixMachine.sixes, 18);
assert.equal(h.bestSpell.wickets, 3);

// A run out in the middle breaks the streak.
const m3 = make([sel('striker', 'a2'), out('a2', 'runout'), sel('striker', 'a3'), out('a3')], 3);
assert.deepEqual(highlights([m3], DEFAULT_ROSTER).hattricks, [], 'run outs do not count for hat-tricks');

// Ties are all listed: two players with the same number of sixes.
const tie = highlights([make([], 1)], DEFAULT_ROSTER);
assert.deepEqual(names(tie.sixMachine.players), ['Ranithu']);

// Same four players under a different team name are still the same team.
const m4 = make([], 4, mk('Crimson', 'Navy'), 'Crimson');
h = highlights([m1, m4], DEFAULT_ROSTER);
assert.equal(h.mostWins.wins, 2); assert.equal(h.mostWins.played, 2);
assert.deepEqual(names(h.mostWins.players).sort(), ['Nithil', 'Ranithu', 'Sadaham', 'Sandanu']);
assert.deepEqual(h.mostWins.names, ['Crimson', 'Reds'], 'names used, newest first');

// Unfinished matches are ignored; empty data gives empty records.
h = highlights([{ ...m2, status: 'in_progress' }], DEFAULT_ROSTER);
assert.equal(h.highestScore, null); assert.deepEqual(h.fifties, []); assert.equal(h.sixMachine, null);
assert.equal(h.mostDucks, null); assert.equal(h.bestPartnership, null); assert.equal(h.mostWins, null);

// Stored facts give the same answer without the balls (this is what the stats route reads).
const stored = (m) => ({ ...m, config: { ballsPerOver: m.config.ballsPerOver }, events: undefined, facts: matchFacts(m.config, m.events, DEFAULT_ROSTER) });
assert.deepEqual(highlights([stored(m1), stored(m2), stored(m4)], DEFAULT_ROSTER), highlights([m1, m2, m4], DEFAULT_ROSTER));
console.log('highlights ok');
