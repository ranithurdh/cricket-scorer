// Super over after a tie:  npm run test:superover
import assert from 'node:assert/strict';
import { computeState } from '../../src/engine.js';
import { summarize } from '../summarize.js';
import { scorecard } from '../scorecard.js';
import { aggregatePlayers } from '../aggregate.js';
import { makeRoster, DEFAULT_MEMBERS } from '../../src/members.js';

const P = (k, n) => n.map((name, i) => ({ id: `${k}${i}`, name }));
const config = {
  wideRuns: 1, noBallRuns: 1, allowConsecutiveOvers: false, overs: 1, ballsPerOver: 2, battingFirst: 0, lastManBats: false,
  teams: [{ name: 'Reds', players: P('a', ['Ranithu', 'Sadaham', 'Guest One']) }, { name: 'Blues', players: P('b', ['Nithil', 'Sandanu', 'Guest Two']) }],
};
const sel = (role, playerId) => ({ type: 'select', role, playerId });
const b = (runs) => ({ type: 'ball', runs });
// Reds 3, Blues 3 -> tied
const main = [sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b0'), b(1), b(2), { type: 'next_innings' },
  sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a0'), b(3), b(0)];

let s = computeState(config, main);
assert.equal(s.matchOver, true); assert.equal(s.result, 'Match tied'); assert.equal(s.offerSuper, true);

// declining keeps it tied and stops asking
s = computeState(config, [...main, { type: 'no_super_over' }]);
assert.equal(s.offerSuper, false); assert.equal(s.result, 'Match tied'); assert.equal(s.matchOver, true);

// super over: Blues (batted second) bat first, 1 over only
const so1 = [...main, { type: 'super_over' }];
s = computeState(config, so1);
assert.equal(s.matchOver, false); assert.equal(s.inSuper, true);
assert.equal(s.current.battingTeam, 1); assert.equal(s.oversLimit, 1);
assert.equal(s.innings.length, 2, 'main innings are untouched');

const so2 = [...so1, sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a1'), b(4), b(6), { type: 'next_innings' },
  sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b1'), b(1), b(1)];
s = computeState(config, so2);
assert.equal(s.target, 11); assert.equal(s.matchOver, true);
assert.equal(s.result, 'Match tied, Blues won the super over'); assert.equal(s.winner, 1); assert.equal(s.offerSuper, false);

// chasing team wins early
s = computeState(config, [...so1, sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a1'), b(1), b(0), { type: 'next_innings' },
  sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b1'), b(6)]);
assert.equal(s.matchOver, true); assert.equal(s.winner, 0);

// tied super over -> offers another, with batting order swapped
const tiedSo = [...so1, sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a1'), b(1), b(0), { type: 'next_innings' },
  sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b1'), b(1), b(0)];
s = computeState(config, tiedSo);
assert.equal(s.matchOver, true); assert.equal(s.winner, null); assert.equal(s.offerSuper, true);
s = computeState(config, [...tiedSo, { type: 'super_over' }]);
assert.equal(s.superOvers.length, 2); assert.equal(s.current.battingTeam, 0);

// asking for a super over when it isn't tied does nothing
const win = [...main.slice(0, 9), b(3), b(3)];
s = computeState(config, [...win, { type: 'super_over' }]);
assert.equal(s.superOvers.length, 0); assert.equal(s.result, 'Blues won by 2 wickets');

// stored summary: same match, winner is the super over winner, player stats come from the main innings only
const roster = makeRoster(DEFAULT_MEMBERS.map((name) => ({ name, aliases: [] })));
const sum = summarize(config, so2, roster);
assert.equal(sum.status, 'completed'); assert.equal(sum.winner, 'Blues');
assert.equal(sum.innings.length, 2); assert.equal(sum.superOvers.length, 1); assert.equal(sum.superOvers[0].winner, 'Blues');
const nithil = sum.playerStats.find((p) => p.name === 'Nithil');
assert.equal(nithil.won, true); assert.equal(nithil.batting.runs, 3, 'super over runs are not in player stats');
assert.equal(aggregatePlayers([sum], roster).find((p) => p.name === 'Nithil').batting.runs, 3);
// mid super over the match counts as in progress
assert.equal(summarize(config, so1, roster).status, 'in_progress');
const card = scorecard(config, so2, roster);
assert.equal(card.winner, 'Blues'); assert.equal(card.superOvers[0].innings.length, 2);
assert.deepEqual(card.teams[1].superScores, [{ runs: 10, wickets: 0 }]);
console.log('superover ok');
