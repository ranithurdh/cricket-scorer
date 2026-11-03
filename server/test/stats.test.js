// No-dependency check of the stats maths:  npm run test:stats
import assert from 'node:assert/strict';
import { summarize } from '../summarize.js';
import { aggregatePlayers } from '../aggregate.js';
import { scorecard } from '../scorecard.js';
import { DEFAULT_MEMBERS, makeRoster } from '../../src/members.js';

const P = (key, names) => names.map((name, i) => ({ id: `${key}${i}`, name }));
const config = {
  wideRuns: 1, noBallRuns: 1, allowConsecutiveOvers: false,
  overs: 2, ballsPerOver: 3, battingFirst: 0, lastManBats: false,
  teams: [
    { name: 'Reds', players: P('a', ['Ranithu', 'Sadaham', 'Guest One']) },
    { name: 'Blues', players: P('b', ['Nithil', 'Sandanu', 'Guest Two']) },
  ],
};
const sel = (role, playerId) => ({ type: 'select', role, playerId });
const events = [
  // Reds bat. Ranithu (a0) & Sadaham (a1) open, Nithil (b0) bowls over 1.
  sel('striker', 'a0'), sel('nonStriker', 'a1'), sel('bowler', 'b0'),
  { type: 'ball', runs: 0 },                                   // dot (Ranithu faced, Nithil dot)
  { type: 'ball', runs: 0, extra: 'wide' },                    // wide: 1 extra, not faced, not a legal ball
  { type: 'ball', runs: 4 },                                   // four
  { type: 'ball', runs: 0, wicket: { outId: 'a0', kind: 'caught', fielderId: 'b1' } }, // Sandanu catches
  // over 2: Sandanu (b1) bowls; Guest One (a2) comes in
  sel('bowler', 'b1'), sel('nonStriker', 'a2'),
  { type: 'drop', playerId: 'b0' },                            // Nithil drops one
  { type: 'ball', runs: 6 },                                   // guest hits six
  { type: 'ball', runs: 1 },                                   // single, ends strike change
  { type: 'ball', runs: 0, wicket: { outId: 'a1', kind: 'runout', fielderId: 'b0' } }, // Nithil run-out
  { type: 'next_innings' },
  // Blues chase: target = Reds total + 1
  sel('striker', 'b0'), sel('nonStriker', 'b1'), sel('bowler', 'a0'),
];

const s = summarize(config, events);
const by = (n) => s.playerStats.find((p) => p.name === n);
console.log(JSON.stringify(s.innings));

assert.equal(s.playerStats.length, 4, 'only the 4 dorm members get rows, guests do not');
assert.ok(!s.playerStats.some((p) => /guest/i.test(p.name)));

const ran = by('Ranithu').batting;
assert.deepEqual([ran.runs, ran.balls, ran.fours, ran.dots, ran.out], [4, 3, 1, 2, true]); // wide not faced; the dismissal ball is a dot

const nit = by('Nithil');
assert.deepEqual(nit.bowling.balls, 3);                      // dot, four, caught = 3 legal; the wide isn't legal
assert.equal(nit.bowling.extras, 1);                         // the wide
assert.equal(nit.bowling.dots, 2);                           // the dot ball + the caught-out ball (0 runs)
assert.equal(nit.bowling.wickets, 1);
assert.equal(nit.bowling.runs, 5);                           // 0 + wide 1 + 4 + 0
assert.equal(nit.bowling.oversEq, 1);                        // 3 balls / 3 per over
assert.equal(nit.fielding.drops, 1);
assert.equal(nit.fielding.runouts, 1);
assert.equal(by('Sandanu').fielding.catches, 1);
assert.equal(by('Sadaham').batting.out, true);

// Aggregation: two copies of the same completed match double everything; averages stay put.
const done = { ...s, status: 'completed' };
const one = aggregatePlayers([done]), two = aggregatePlayers([done, done]);
const get = (arr, n) => arr.find((p) => p.name === n);
assert.equal(one.length, 8, 'all 8 members listed, even those who never played');
assert.equal(get(one, 'Oneth').matches, 0);
assert.equal(get(one, 'Oneth').batting.average, null);
assert.equal(get(two, 'Ranithu').batting.runs, 8);
assert.equal(get(two, 'Ranithu').batting.highScore, 4);
assert.equal(get(two, 'Ranithu').batting.average, 4);                 // 8 runs / 2 dismissals
assert.equal(get(two, 'Ranithu').batting.boundaryPct, 33.3);          // 2 fours / 6 balls
assert.equal(get(two, 'Ranithu').batting.dotPct, 66.7);
assert.equal(get(two, 'Ranithu').batting.strikeRate, 133.33);
assert.equal(get(two, 'Nithil').bowling.economy, 5);                  // 10 runs / 2 overs
assert.equal(get(two, 'Nithil').bowling.average, 5);                  // 10 runs / 2 wkts
assert.equal(get(two, 'Nithil').bowling.dotPct, 66.7);                // 4 dots / 6 legal balls
assert.equal(get(two, 'Nithil').bowling.extras, 2);
assert.equal(get(two, 'Nithil').bowling.matches, 2);                  // bowled in both copies
assert.equal(get(two, 'Oneth').bowling.matches, 0);
assert.equal(get(two, 'Nithil').fielding.catchPct, 0);                // 0 catches, 2 drops
assert.equal(get(two, 'Sandanu').fielding.catchPct, 100);

// in-progress matches never count
assert.equal(aggregatePlayers([]).find((p) => p.name === 'Ranithu').matches, 0);

// ---- saved players: the roster comes from the database ----
const others = DEFAULT_MEMBERS.filter((n) => n !== 'Ranithu').map((name) => ({ name }));

// A guest saved as a player starts counting once they're on the roster.
const withGuest = makeRoster([...DEFAULT_MEMBERS.map((name) => ({ name })), { name: 'Guest One' }]);
const sg = summarize(config, events, withGuest);
assert.equal(sg.playerStats.length, 5, 'Guest One now gets a row');
const g1 = sg.playerStats.find((p) => p.name === 'Guest One').batting;
assert.deepEqual([g1.batted, g1.balls, g1.runs], [true, 1, 0]); // came in, faced one dot ball
assert.equal(aggregatePlayers([{ ...sg, status: 'completed' }], withGuest).length, 9);

// Renaming keeps history: the old name is an alias, rows saved under it still land on the player.
const renamed = makeRoster([...others, { name: 'Ran', aliases: ['ranithu'], photo: '/api/players/abc/photo?v=1' }]);
const sr = summarize(config, events, renamed);
assert.ok(sr.playerStats.some((p) => p.name === 'Ran' && p.nameKey === 'ran'), 'old matches use the new name');
const stale = aggregatePlayers([done], renamed); // `done` was summarised before the rename (nameKey "ranithu")
assert.equal(get(stale, 'Ran').batting.runs, 4, 'stale rows still reach the renamed player');
assert.equal(get(stale, 'Ran').photo, '/api/players/abc/photo?v=1', 'the face URL is passed to the leaderboard');
assert.equal(get(stale, 'Nithil').photo, null);
assert.ok(!stale.some((p) => p.name === 'Ranithu'));

// Removing a player takes them off the board without touching anyone else.
const without = makeRoster(others);
assert.equal(aggregatePlayers([done], without).length, 7);
assert.ok(!summarize(config, events, without).playerStats.some((p) => p.name === 'Ranithu'));

// Name matching ignores case and spacing.
assert.equal(withGuest.canonical('  guest   one '), 'Guest One');
assert.equal(withGuest.canonical('Stranger '), 'Stranger');
assert.equal(withGuest.isMember('RANITHU'), true);


// ---- scorecard (Matches page): everyone, guests included ----
const card = scorecard(config, events, makeRoster([...DEFAULT_MEMBERS.map((name) => ({ name })), ]));
const bat1 = card.innings[0].batting;
const rb = bat1.find((b) => b.name === 'Ranithu'), sb = bat1.find((b) => b.name === 'Sadaham'), gb = bat1.find((b) => b.name === 'Guest One');
assert.deepEqual([rb.runs, rb.balls, rb.how], [4, 3, 'c Sandanu b Nithil']);
assert.deepEqual([sb.runs, sb.balls, sb.how], [7, 2, 'run out (Nithil)']);
assert.deepEqual([gb.runs, gb.balls, gb.how], [0, 1, 'not out'], 'guests are on the scorecard');
const nb = card.innings[0].bowling.find((b) => b.name === 'Nithil');
assert.deepEqual([nb.overs, nb.runs, nb.wickets, nb.economy], ['1.0', 5, 1, 5]);
assert.equal(card.teams[0].players.length, 3);
assert.equal(card.teams[0].players.find((p) => p.name === 'Guest One').member, false);
assert.equal(card.winner, null, 'unfinished match has no winner');

console.log('stats tests passed');
