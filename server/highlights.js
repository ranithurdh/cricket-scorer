// "Home page" records, derived from completed matches only (same rule as the leaderboards).
// Only saved players (the dorm roster) are considered, guests never appear. Pure JS so it can be tested in node.
import { formatOvers } from '../src/engine.js';
import { factsFor } from './facts.js';
import { DEFAULT_ROSTER } from './../src/members.js';

const time = (m) => new Date(m.playedAt ?? m.createdAt ?? 0).getTime();
const who = (roster, name) => {
  const e = roster.find(name);
  return e ? { name: e.name, photo: e.photo ?? null } : null; // null = guest
};
const bump = (map, person, by = 1) => {
  const e = map.get(person.name) ?? { ...person, count: 0 };
  e.count += by;
  map.set(person.name, e);
  return e;
};
const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

export function highlights(matches, roster = DEFAULT_ROSTER) {
  const done = matches.filter((m) => m.status === 'completed').sort((a, b) => time(a) - time(b));

  let highestScore = null, bestSpell = null, bestPartnership = null;
  const fifties = new Map(), hattricks = new Map(), sixes = new Map(), ducks = new Map();
  const teams = new Map(); // the same set of saved players = the same team, whatever it was called that day

  for (const m of done) {
    const when = m.playedAt ?? m.createdAt;
    const bpo = m.config.ballsPerOver;
    const teamNames = m.teams ?? m.config.teams.map((t) => t.name);
    const against = (team) => teamNames.find((t) => t !== team) ?? null;

    // teams are identified by who played in them (saved players only), not by the name typed at setup
    for (const name of teamNames) {
      const members = [...new Set((m.playerStats ?? []).filter((p) => p.team === name && roster.find(p.name)).map((p) => roster.find(p.name).name))].sort();
      if (!members.length) continue;
      const key = members.join('\u0000');
      const t = teams.get(key) ?? { members, names: [], played: 0, wins: 0 };
      t.played += 1;
      if (m.winner && m.winner === name) t.wins += 1;
      t.names = [name, ...t.names.filter((n) => n !== name)]; // most recent name first
      teams.set(key, t);
    }

    // innings records from the saved per-player rows
    for (const p of m.playerStats ?? []) {
      const person = who(roster, p.name);
      if (!person) continue;
      const bat = p.batting ?? {}, bowl = p.bowling ?? {};
      if (bat.batted) {
        const better = !highestScore || bat.runs > highestScore.runs || (bat.runs === highestScore.runs && bat.balls < highestScore.balls);
        if (better) highestScore = { ...person, runs: bat.runs, balls: bat.balls, fours: bat.fours, sixes: bat.sixes, notOut: !bat.out, against: against(p.team), when };
        if (bat.runs >= 50) { const e = bump(fifties, person); e.best = Math.max(e.best ?? 0, bat.runs); }
        if (bat.sixes > 0) bump(sixes, person, bat.sixes);
        if (bat.out && bat.runs === 0) bump(ducks, person);
      }
      if ((bowl.balls ?? 0) > 0 && bowl.wickets > 0) {
        const b = bestSpell;
        const better = !b || bowl.wickets > b.wickets || (bowl.wickets === b.wickets && (bowl.runs < b.runs || (bowl.runs === b.runs && bowl.balls < b.balls)));
        if (better) bestSpell = { ...person, wickets: bowl.wickets, runs: bowl.runs, balls: bowl.balls, overs: formatOvers(bowl.balls, bpo), against: against(p.team), when };
      }
    }

    // hat-tricks and the match's best partnership come from the facts stored with the match (no replaying)
    const f = factsFor(m, roster);
    for (const h of f.hattricks ?? []) { const person = who(roster, h.name); if (person) bump(hattricks, person, h.count); }
    const part = f.partnership, pp = part && part.players.map((n) => who(roster, n));
    if (pp && pp.every(Boolean) && (!bestPartnership || part.runs > bestPartnership.runs || (part.runs === bestPartnership.runs && part.balls < bestPartnership.balls))) {
      bestPartnership = { players: pp, runs: part.runs, balls: part.balls, team: part.team, against: part.against, when };
    }
  }

  const list = (map) => [...map.values()].sort(byCount);
  const top = (map) => { // everyone tied for the most
    const all = list(map);
    return all.length ? { count: all[0].count, players: all.filter((e) => e.count === all[0].count).map(({ name, photo }) => ({ name, photo })) } : null;
  };

  // most wins; ties go to the better win rate, then the one with more matches
  const best = [...teams.values()].filter((t) => t.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.wins / b.played - a.wins / a.played || b.played - a.played || a.members.join().localeCompare(b.members.join()))[0] ?? null;

  return {
    matches: done.length,
    highestScore, bestSpell, bestPartnership,
    fifties: list(fifties).map(({ name, photo, count, best: top }) => ({ name, photo, count, best: top })),
    hattricks: list(hattricks).map(({ name, photo, count }) => ({ name, photo, count })),
    sixMachine: (() => { const t = top(sixes); return t && { sixes: t.count, players: t.players }; })(),
    mostDucks: (() => { const t = top(ducks); return t && { ducks: t.count, players: t.players }; })(),
    mostWins: best && {
      players: best.members.map((n) => who(roster, n)), names: best.names.slice(0, 3),
      wins: best.wins, played: best.played, winPct: Math.round((best.wins / best.played) * 1000) / 10,
    },
  };
}
