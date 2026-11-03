// Turns a match (config + event log) into the flat summary that gets stored next to it.
// Reuses the frontend's scoring engine so the server and the app can never disagree.
import { FACTS_VERSION, matchFacts } from './facts.js';
import { computeState, formatOvers, nameOf } from '../src/engine.js';
import { DEFAULT_ROSTER, nameKey } from '../src/members.js';

export { nameKey };

export function validateMatch({ config, events }) {
  if (!config || typeof config !== 'object') return 'config is required';
  if (!Array.isArray(config.teams) || config.teams.length !== 2) return 'config.teams must have exactly 2 teams';
  for (const t of config.teams) {
    if (!t?.name || !Array.isArray(t.players) || t.players.length < 1) return 'each team needs a name and at least 1 player';
    if (t.players.some((p) => !p?.id || !p?.name)) return 'every player needs an id and a name';
  }
  if (!Number.isInteger(config.overs) || config.overs < 1) return 'config.overs must be a positive integer';
  if (!Number.isInteger(config.ballsPerOver) || config.ballsPerOver < 1) return 'config.ballsPerOver must be a positive integer';
  if (![0, 1].includes(config.battingFirst)) return 'config.battingFirst must be 0 or 1';
  if (!Array.isArray(events)) return 'events must be an array';
  if (events.some((e) => !e || typeof e.type !== 'string')) return 'every event needs a type';
  return null;
}

// `roster` decides who counts as a dorm member (and under what name); it comes from the saved players in the database.
export function summarize(config, events, roster = DEFAULT_ROSTER) {
  const state = computeState(config, events);
  const bpo = config.ballsPerOver;

  const innings = state.innings.map((inn) => ({
    team: config.teams[inn.battingTeam].name,
    runs: inn.runs,
    wickets: inn.wickets,
    overs: formatOvers(inn.legalBalls, bpo),
    extras: inn.extras,
    closed: inn.closed,
  }));

  // winner: team index, or null for tie / not finished (a super over decides a tied match)
  const winner = state.winner;

  // One row per dorm member who played. Guests are in the match record but get no stats.
  // Ids like "a0" only mean something inside one match, so rows are keyed by name.
  const rows = new Map();
  config.teams.forEach((team, teamIdx) => {
    for (const p of team.players) {
      if (!roster.isMember(p.name)) continue;
      rows.set(p.id, {
        name: roster.canonical(p.name),
        nameKey: roster.keyOf(p.name),
        team: team.name,
        won: state.matchOver ? (winner === null ? null : winner === teamIdx) : null,
        batting: { batted: false, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, out: false, dismissal: null },
        bowling: { balls: 0, oversEq: 0, runs: 0, wickets: 0, dots: 0, extras: 0 },
        fielding: { catches: 0, runouts: 0, drops: 0 },
      });
    }
  });

  for (const inn of state.innings) {
    for (const [id, b] of Object.entries(inn.batters)) {
      const row = rows.get(id);
      if (!row || (b.status === 'yet' && b.balls === 0)) continue;
      row.batting = {
        batted: true,
        runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, dots: b.dots,
        out: b.status === 'out',
        dismissal: b.out
          ? { kind: b.out.kind, bowler: b.out.bowlerId ? nameOf(config, b.out.bowlerId) : null,
              fielder: b.out.fielderId ? nameOf(config, b.out.fielderId) : null }
          : null,
      };
    }
    for (const [id, bw] of Object.entries(inn.bowlers)) {
      const row = rows.get(id);
      if (row) row.bowling = { balls: bw.balls, oversEq: bw.balls / bpo, runs: bw.runs, wickets: bw.wickets, dots: bw.dots, extras: bw.extras };
    }
    for (const [id, f] of Object.entries(inn.fielding)) {
      const row = rows.get(id);
      if (row) row.fielding = { ...f };
    }
  }

  return {
    status: state.matchOver ? 'completed' : 'in_progress',
    result: state.result,
    winner: winner === null ? null : config.teams[winner].name,
    teams: config.teams.map((t) => t.name),
    innings,
    superOvers: state.superOvers.map((so) => ({
      winner: so.winner === null ? null : config.teams[so.winner].name,
      innings: so.innings.map((i) => ({ team: config.teams[i.battingTeam].name, runs: i.runs, wickets: i.wickets, overs: formatOvers(i.legalBalls, bpo) })),
    })),
    playerStats: [...rows.values()],
    facts: matchFacts(config, events, roster), // hat-tricks, partnership, matchups... worked out once, here
    factsVersion: FACTS_VERSION,
  };
}
