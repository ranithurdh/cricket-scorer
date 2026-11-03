// Data for the 1v1 page: things the career totals can't give (maidens, stumpings, best figures) and every
// batter-vs-bowler matchup, built from each completed match's ball-by-ball log. Saved players only.
import { factsFor } from './facts.js';
import { DEFAULT_ROSTER } from '../src/members.js';

const time = (m) => new Date(m.playedAt ?? m.createdAt ?? 0).getTime();
const round4 = (v) => Math.round(v * 10000) / 10000;

export function versus(matches, roster = DEFAULT_ROSTER, playerName) {
  const me = roster.find(playerName);
  if (!me) return null;
  const done = matches.filter((m) => m.status === 'completed').sort((a, b) => time(a) - time(b));

  const pairs = new Map(); // "batter\0bowler" -> totals for that matchup
  const people = new Map(roster.list.map((e) => [e.name, { maidens: 0, stumpings: 0, bestFigures: null }]));

  for (const m of done) {
    const bpo = m.config.ballsPerOver;
    // best figures in one match, from the saved per-player rows
    for (const p of m.playerStats ?? []) {
      const e = roster.find(p.name), bw = p.bowling ?? {};
      if (!e || !(bw.balls > 0)) continue;
      const cur = people.get(e.name).bestFigures;
      if (!cur || bw.wickets > cur.wickets || (bw.wickets === cur.wickets && (bw.runs < cur.runs || (bw.runs === cur.runs && bw.balls > cur.balls)))) {
        people.get(e.name).bestFigures = { wickets: bw.wickets, runs: bw.runs, balls: bw.balls, ballsPerOver: bpo, when: m.playedAt ?? m.createdAt };
      }
    }

    // matchups, maidens and stumpings come from the facts stored with the match (no replaying)
    const f = factsFor(m, roster);
    for (const p of f.pairs ?? []) {
      const key = `${p.bat}\u0000${p.bowl}`;
      const a = pairs.get(key) ?? { innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, outs: 0, bRuns: 0, legal: 0, oversEq: 0, bDots: 0 };
      for (const k of Object.keys(a)) a[k] = k === 'oversEq' ? round4(a[k] + p[k]) : a[k] + p[k];
      pairs.set(key, a);
    }
    for (const q of f.people ?? []) {
      const mine = people.get(q.name);
      if (mine) { mine.maidens += q.maidens; mine.stumpings += q.stumpings; }
    }
  }

  const row = (opponent, a) => ({ opponent, photo: roster.find(opponent)?.photo ?? null, ...a });
  const batting = [], bowling = [];
  for (const [key, a] of pairs) {
    const [bat, bowl] = key.split('\u0000');
    if (bat === me.name) batting.push(row(bowl, a));    // me batting against this bowler
    if (bowl === me.name) bowling.push(row(bat, a));    // me bowling to this batter
  }
  const mine = people.get(me.name);
  return { player: me.name, maidens: mine.maidens, stumpings: mine.stumpings, bestFigures: mine.bestFigures, batting, bowling };
}
