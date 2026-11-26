// The numbers the stream graphic shows (src/graphicStats.js), checked against the real scoring engine:  npm run test:graphic
import assert from 'node:assert/strict';
import { computeState } from '../../src/engine.js';
import { ballToken, bowlerLine, liveNote, partnership, summaryView, targetView, wormData, wormNote } from '../../src/graphicStats.js';

const team = (n, k) => ({ name: n, players: [0, 1, 2, 3].map((j) => ({ id: `${k}${j}`, name: `${n}${j}` })) });
const config = { wideRuns: 1, noBallRuns: 1, allowConsecutiveOvers: false, overs: 2, ballsPerOver: 6, battingFirst: 0, lastManBats: false, teams: [team('Red', 'a'), team('Blue', 'b')] };
const ball = (runs, extra = null, wicket = null) => ({ type: 'ball', runs, extra, wicket });
const sel = (role, playerId) => ({ type: 'select', role, playerId });

// Red bat: 4, 1, dot, wide+1 (2 runs), 2  -> 9 runs after 4 legal balls
const first = [sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b0'), ball(4), ball(1), ball(0), ball(1, 'wide'), ball(2)];
let s = computeState(config, first);
assert.equal(s.current.runs, 9);
assert.equal(s.current.legalBalls, 4);
assert.deepEqual(partnership(s.current), { runs: 9, balls: 4 });                       // wide isn't a ball faced
assert.deepEqual(s.current.overBalls.map((b) => ballToken(b).cls), ['boundary', 'run', 'dot', 'extra', 'run']);
assert.deepEqual(ballToken(s.current.overBalls[3]), { main: '2', sub: 'Wd', cls: 'extra' });
assert.deepEqual(bowlerLine(s.current, 'b0', 6), { overs: '0.4', runs: 9, wickets: 0, dots: 1, econ: 13.5 });

let t = targetView(s);
assert.equal(t.kind, 'projected');
assert.equal(t.projected, 27);                                                         // 9 off 4 balls, 12 balls in the innings
assert.equal(t.crr, 13.5);
assert.equal(t.oversLeft, '1.2');
assert.equal(t.inHand, 3);
assert.equal(liveNote(s), null);                                                       // nothing to say under the bar in the 1st innings

// A wicket resets the partnership
s = computeState(config, [...first, ball(0, null, { kind: 'bowled', outId: 'a0' }), sel('striker', 'a2'), ball(1)]);
assert.equal(s.current.wickets, 1);
assert.deepEqual(partnership(s.current), { runs: 1, balls: 1 });

// Innings break: Blue need 10 from a full innings
const breakEv = [...first, ball(0, null, { kind: 'bowled', outId: 'a0' }), { type: 'end_innings' }];
s = computeState(config, breakEv);
t = targetView(s);
assert.equal(t.kind, 'set');
assert.deepEqual([t.team, t.need, t.left, t.score], ['Blue', 10, 12, '9/1']);
assert.deepEqual(liveNote(s), { left: 'Innings complete', right: 'Target 10' });

// Chase: Blue are 5 off 2 balls -> need 5 from 10
const chase = [...breakEv, { type: 'next_innings' }, sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a1'), ball(4), ball(1)];
s = computeState(config, chase);
t = targetView(s);
assert.equal(t.kind, 'chase');
assert.deepEqual([t.team, t.need, t.left, t.target, t.rrr, t.crr, t.inHand, t.oversLeft], ['Blue', 5, 10, 10, 3, 15, 3, '1.4']);
assert.deepEqual(liveNote(s), { left: 'Need 5 from 10 balls', right: 'Target 10' });
let sum = summaryView(s);
assert.equal(sum.rows.length, 2);
assert.equal(sum.status, 'Blue need 5 from 10 balls');
assert.deepEqual([sum.rows[0].bat.name, sum.rows[0].bat.runs, sum.rows[0].bowl.name], ['Red0', 7, 'Blue0']);
assert.equal(sum.rows[1].live, true);

// Singular wording, then the win
const dots = (n) => Array.from({ length: n }, () => ball(0));
s = computeState(config, [...chase, ...dots(4), sel('bowler', 'a2'), ...dots(5)]);   // 11 of 12 balls bowled
t = targetView(s);
assert.deepEqual([t.kind, t.need, t.left], ['chase', 5, 1]);
assert.deepEqual(liveNote(s), { left: 'Need 5 from 1 ball', right: 'Target 10' });
s = computeState(config, [...chase, ball(4), ball(1)]);
assert.equal(s.matchOver, true);
t = targetView(s);
assert.equal(t.kind, 'result');
assert.equal(t.text, 'Blue won by 3 wickets');
assert.equal(summaryView(s).status, 'Blue won by 3 wickets');
assert.deepEqual(liveNote(s), { left: 'Blue won by 3 wickets' });

// Worm graph: one point per ball (x in overs), wickets marked, wides add runs without moving along
{
  const w = wormData(computeState(config, [...first, ball(0, null, { kind: 'bowled', outId: 'a0' })]));
  assert.equal(w.lines.length, 1);
  assert.equal(w.maxOvers, 2);
  assert.deepEqual(w.lines[0].points.map((p) => [Number(p.x.toFixed(3)), p.y]), [[0, 0], [0.167, 4], [0.333, 5], [0.5, 5], [0.5, 7], [0.667, 9], [0.833, 9]]);
  assert.deepEqual(w.lines[0].wickets.map((p) => [Number(p.x.toFixed(3)), p.y]), [[0.833, 9]]);
  assert.equal(w.lines[0].balls, 6);
  assert.equal(w.lines[0].points.length, 7);
  const live = computeState(config, [...first, ball(0, null, { kind: 'bowled', outId: 'a0' }), { type: 'end_innings' }, { type: 'next_innings' }, sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a1'), ball(4)]);
  assert.equal(wormData(live).lines.length, 2);
  assert.equal(wormData(live).target, 10);
  assert.equal(wormNote(live), 'Blue need 6 more runs to win from 11 balls');
}

console.log('graphic stats ok');
