// No-dependency check of the 1v1 maths:  npm run test:versus
import assert from 'node:assert/strict';
import { versus } from '../versus.js';
import { summarize } from '../summarize.js';
import { DEFAULT_ROSTER } from '../../src/members.js';
import { matchFacts } from '../facts.js';

const P = (key, names) => names.map((name, i) => ({ id: `${key}${i}`, name }));
const config = {
  wideRuns: 1, noBallRuns: 1, allowConsecutiveOvers: false, overs: 1, ballsPerOver: 6, battingFirst: 0, lastManBats: false,
  teams: [
    { name: 'Reds', players: P('a', ['Ranithu', 'Sadaham', 'Nithil', 'Sandanu']) },
    { name: 'Blues', players: P('b', ['Bhashika', 'Senuja', 'Oneth', 'Nadin']) },
  ],
};
const sel = (role, playerId) => ({ type: 'select', role, playerId });
const dot = { type: 'ball', runs: 0 };
const match = (events, id) => ({ _id: id, config, events, status: 'completed', playedAt: `2026-11-0${id}T10:00:00Z`, playerStats: summarize(config, events).playerStats });
const open = [sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b0')];

// Match 1: Bhashika bowls a maiden over to Ranithu (6 dots; a leg bye doesn't spoil it would be 7th, so skip).
const m1 = match([...open, dot, dot, dot, dot, dot, dot], 1);
// Match 2: Bhashika: six, four, wide, then bowls Ranithu; Senuja stumps the next one.
const m2 = match([...open,
  { type: 'ball', runs: 6 }, { type: 'ball', runs: 4 }, { type: 'ball', runs: 0, extra: 'wide' },
  { type: 'ball', runs: 0, wicket: { outId: 'a0', kind: 'bowled' } }, sel('striker', 'a2'),
  { type: 'ball', runs: 0, wicket: { outId: 'a2', kind: 'stumped', fielderId: 'b1' } }, sel('striker', 'a3'),
  { type: 'ball', runs: 0, wicket: { outId: 'a3', kind: 'runout', fielderId: 'b2' } },
], 2);

const r = versus([m1, m2, { ...m2, status: 'in_progress' }], DEFAULT_ROSTER, 'ranithu');
assert.equal(r.player, 'Ranithu');
const vsB = r.batting.find((x) => x.opponent === 'Bhashika');
assert.equal(vsB.innings, 2);
assert.equal(vsB.runs, 10); assert.equal(vsB.fours, 1); assert.equal(vsB.sixes, 1);
assert.equal(vsB.balls, 6 + 3, 'faced 6 dots, then 6, 4, out (the wide is not faced)');
assert.equal(vsB.outs, 1);
assert.equal(vsB.bRuns, 6 + 4 + 1 + 0, 'the wide is charged to the bowler');

const b = versus([m1, m2], DEFAULT_ROSTER, 'Bhashika');
assert.equal(b.maidens, 1, 'only the all-dot over is a maiden');
const toRanithu = b.bowling.find((x) => x.opponent === 'Ranithu');
assert.equal(toRanithu.outs, 1);
assert.equal(b.bowling.find((x) => x.opponent === 'Nithil').outs, 1, 'stumped counts for the bowler');
assert.equal(b.bowling.find((x) => x.opponent === 'Sandanu').outs, 0, 'run outs are not the bowler\'s');
assert.deepEqual([b.bestFigures.wickets, b.bestFigures.runs], [2, 11]);
assert.equal(versus([m1, m2], DEFAULT_ROSTER, 'Senuja').stumpings, 1);
assert.equal(versus([m1, m2], DEFAULT_ROSTER, 'Nobody'), null);

// Stored facts give the same answer without the balls: this is the shape the stats route reads (no events at all).
const stored = (m) => ({ ...m, config: { ballsPerOver: m.config.ballsPerOver }, events: undefined, facts: matchFacts(m.config, m.events, DEFAULT_ROSTER) });
assert.deepEqual(versus([stored(m1), stored(m2)], DEFAULT_ROSTER, 'Bhashika'), versus([m1, m2], DEFAULT_ROSTER, 'Bhashika'));
assert.deepEqual(versus([stored(m1), stored(m2)], DEFAULT_ROSTER, 'Ranithu'), versus([m1, m2], DEFAULT_ROSTER, 'Ranithu'));
console.log('versus ok');
