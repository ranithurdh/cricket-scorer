// Pure helpers for the stream graphic (no React). Everything is derived from computeState().
import { formatOvers, nameOf, players } from './engine.js';
import { overallRatings } from './ratings.js';

const SHORT = { bye: 'Bye', legbye: 'Lb', wide: 'Wd', noball: 'Nb' };

// One box in the "this over" strip (same rules as the scoring page).
export function ballToken(b) {
  const total = b.batRuns + b.extraRuns;
  const sub = SHORT[b.extra] ?? '';
  if (b.wicket) return { main: 'W', sub: total ? `${sub} +${total}`.trim() : sub, cls: 'wicket' };
  const cls = b.batRuns >= 4 ? 'boundary' : b.extra ? 'extra' : total === 0 ? 'dot' : 'run';
  return { main: total === 0 ? '•' : String(total), sub, cls };
}

export const strikeRate = (runs, balls) => (balls ? (runs * 100) / balls : null);
export const fixed = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? '-' : n.toFixed(d));
export const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;

// Runs and balls faced by the current pair (everything since the last wicket).
export function partnership(inn) {
  let start = 0;
  for (let i = inn.log.length - 1; i >= 0; i--) if (inn.log[i].wicket) { start = i + 1; break; }
  let runs = 0, balls = 0;
  for (let i = start; i < inn.log.length; i++) {
    const e = inn.log[i];
    runs += e.batRuns + e.extraRuns;
    if (e.extra !== 'wide') balls += 1;
  }
  return { runs, balls };
}

export function bowlerLine(inn, id, bpo) {
  const b = inn.bowlers[id];
  if (!b) return null;
  return {
    overs: formatOvers(b.balls, bpo), runs: b.runs, wickets: b.wickets, dots: b.dots,
    econ: b.balls ? (b.runs * bpo) / b.balls : null,
  };
}

// What the Target button shows.
//  chase     second innings in progress: need X runs from Y balls
//  set       first innings just finished: the other team needs X from a full innings
//  projected first innings in progress: where the score is heading
//  result    match finished
export function targetView(state) {
  const { config, current: inn } = state;
  const bpo = config.ballsPerOver;
  const batting = config.teams[inn.battingTeam].name;
  const totalBalls = state.oversLimit * bpo;
  const crr = inn.legalBalls ? (inn.runs * bpo) / inn.legalBalls : null;
  const inHand = players(config, inn.battingTeam).length - (config.lastManBats ? 0 : 1) - inn.wickets;
  if (state.matchOver) return { kind: 'result', text: state.result };
  if (state.target) {
    const left = state.ballsLeft;
    return {
      kind: 'chase', team: batting, need: state.need, left, target: state.target,
      rrr: left > 0 ? (state.need * bpo) / left : null, crr, inHand, oversLeft: formatOvers(Math.max(0, left), bpo),
    };
  }
  if (inn.closed) {
    const t = inn.runs + 1;
    return { kind: 'set', team: config.teams[inn.bowlingTeam].name, need: t, left: totalBalls, target: t, from: batting, score: `${inn.runs}/${inn.wickets}` };
  }
  return {
    kind: 'projected', team: batting, crr, inHand,
    projected: inn.legalBalls ? Math.round((inn.runs / inn.legalBalls) * totalBalls) : null,
    oversLeft: formatOvers(Math.max(0, totalBalls - inn.legalBalls), bpo),
  };
}

const topBatter = (config, inn) => {
  const rows = Object.entries(inn.batters).filter(([, b]) => b.balls > 0 || b.status === 'out');
  if (!rows.length) return null;
  const [id, b] = rows.sort((x, y) => y[1].runs - x[1].runs || x[1].balls - y[1].balls)[0];
  return { name: nameOf(config, id), runs: b.runs, balls: b.balls, out: b.status === 'out' };
};
const topBowler = (config, inn) => {
  const rows = Object.entries(inn.bowlers).filter(([, b]) => b.balls > 0);
  if (!rows.length) return null;
  const [id, b] = rows.sort((x, y) => y[1].wickets - x[1].wickets || x[1].runs - y[1].runs)[0];
  return { name: nameOf(config, id), wickets: b.wickets, runs: b.runs };
};

// What the Summary button shows: both innings with their best performers, plus the match status line.
export function summaryView(state) {
  const { config, current: inn } = state;
  const bpo = config.ballsPerOver;
  const rows = state.innings.map((i) => ({
    team: config.teams[i.battingTeam].name, runs: i.runs, wickets: i.wickets, overs: formatOvers(i.legalBalls, bpo),
    bat: topBatter(config, i), bowl: topBowler(config, i), live: i === inn && !i.closed,
  }));
  const batting = config.teams[inn.battingTeam].name;
  const status = state.matchOver ? state.result
    : state.target && !inn.closed ? `${batting} need ${state.need} from ${state.ballsLeft} ${plural(state.ballsLeft, 'ball')}`
    : inn.closed ? `Target ${inn.runs + 1}`
    : `${batting} batting`;
  const supers = state.superOvers.map((so) => so.innings.map((i) => `${config.teams[i.battingTeam].name} ${i.runs}/${i.wickets}`).join('  v  '));
  return { rows, status, supers };
}

// The strip that hangs under the Live bar.
export function liveNote(state) {
  const inn = state.current;
  if (state.matchOver) return { left: state.result };
  if (inn.closed) return { left: 'Innings complete', right: `Target ${inn.runs + 1}` };
  if (state.target) return { left: `Need ${state.need} from ${state.ballsLeft} ${plural(state.ballsLeft, 'ball')}`, right: `Target ${state.target}` };
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Everything below feeds the pop-up panels and the full-screen graphics.
// ---------------------------------------------------------------------------------------------------

const ratio = (n, d) => (d > 0 ? n / d : null);

// Place on the Overall-rating board for every saved player: Map(name -> { bat, bowl }), each { place, of, score } or null.
// Same ordering as the Leaderboards page.
export function rankings(list) {
  const board = (section, has) => {
    const { map } = overallRatings(list, section, has);
    const score = (p) => map.get(p.name)?.score ?? null;
    const rated = list.filter((p) => score(p) != null)
      .sort((a, b) => score(b) - score(a) || b.matches - a.matches || a.name.localeCompare(b.name));
    return new Map(rated.map((p, i) => [p.name, { place: i + 1, of: rated.length, score: score(p) }]));
  };
  const bat = board('batting', (p) => p.batting.innings > 0);
  const bowl = board('bowling', (p) => p.bowling.balls > 0);
  return new Map(list.map((p) => [p.name, { bat: bat.get(p.name) ?? null, bowl: bowl.get(p.name) ?? null }]));
}

// Worm graph: cumulative runs against overs for each innings of the main match (ball by ball), with the wickets marked.
export function wormView(state) {
  const { config } = state;
  const bpo = config.ballsPerOver;
  const lines = state.innings.map((inn, k) => {
    const pts = [{ x: 0, y: 0 }], wk = [];
    let legal = 0;
    for (const e of inn.log) {
      if (e.legal) legal += 1;
      const x = legal / bpo;
      pts.push({ x, y: e.runsAfter });
      if (e.wicket) wk.push({ x, y: e.runsAfter });
    }
    return {
      k, team: config.teams[inn.battingTeam].name, pts, wk,
      runs: inn.runs, wickets: inn.wickets, overs: formatOvers(inn.legalBalls, bpo),
    };
  });
  const target = state.innings.length === 2 ? state.innings[0].runs + 1 : null;
  const top = Math.max(10, ...lines.map((l) => l.runs), target ?? 0);
  const step = top <= 40 ? 10 : top <= 80 ? 20 : top <= 200 ? 50 : 100;
  const yMax = Math.max(step * 3, Math.ceil((top * 1.04) / step) * step);
  return { lines, xMax: config.overs, yMax, step, target, status: summaryView(state).status };
}

// This batter against this bowler in the innings being played right now.
export function matchupToday(inn, batterId, bowlerId, bpo) {
  const a = { balls: 0, runs: 0, fours: 0, sixes: 0, dots: 0, outs: 0, bRuns: 0, legal: 0 };
  for (const e of inn.log) {
    if (e.strikerId !== batterId || e.bowlerId !== bowlerId) continue;
    if (e.extra !== 'wide') { a.balls += 1; if (e.batRuns === 0) a.dots += 1; }
    a.runs += e.batRuns;
    if (e.batRuns === 4) a.fours += 1;
    if (e.batRuns === 6) a.sixes += 1;
    if (e.legal) a.legal += 1;
    a.bRuns += e.batRuns + (e.extra === 'wide' || e.extra === 'noball' ? e.extraRuns : 0);
    if (e.wicket && e.wicket.outId === batterId && e.wicket.credited) a.outs += 1;
  }
  return h2h(a, bpo, a.balls > 0 || a.legal > 0);
}

// Raw matchup totals (from the 1v1 data or from this match) -> the numbers shown on the pop-up.
export function h2h(a, bpo, has = true) {
  if (!a || !has) return null;
  return {
    innings: a.innings ?? null, balls: a.balls, runs: a.runs, outs: a.outs, fours: a.fours, sixes: a.sixes,
    sr: ratio(a.runs * 100, a.balls), dotPct: ratio(a.dots * 100, a.balls),
    avg: ratio(a.runs, a.outs), econ: a.oversEq != null ? ratio(a.bRuns, a.oversEq) : ratio(a.bRuns * bpo, a.legal),
  };
}

const KIND = { bowled: 'Bowled', caught: 'Caught', stumped: 'Stumped', runout: 'Run out', other: 'Out' };

// The most recent wicket of the match (this innings first, otherwise the one before).
export function lastWicket(state) {
  const { config } = state;
  for (const inn of [state.current, ...state.innings.filter((i) => i !== state.current).reverse()]) {
    for (let i = inn.log.length - 1; i >= 0; i--) {
      const w = inn.log[i].wicket;
      if (!w) continue;
      const b = inn.batters[w.outId];
      return {
        name: nameOf(config, w.outId), runs: b?.runs ?? 0, balls: b?.balls ?? 0,
        how: KIND[w.kind] ?? 'Out',
        bowler: w.credited ? nameOf(config, inn.log[i].bowlerId) : '',
        fielder: w.fielderId ? nameOf(config, w.fielderId) : '',
      };
    }
  }
  return null;
}

// Both innings in full, for the Match card.
export function matchCard(state) {
  const { config } = state;
  const bpo = config.ballsPerOver;
  const innings = state.innings.map((inn) => {
    const bats = Object.entries(inn.batters).filter(([, b]) => b.balls > 0 || b.status === 'out')
      .sort((x, y) => y[1].runs - x[1].runs || x[1].balls - y[1].balls).slice(0, 3)
      .map(([id, b]) => ({ name: nameOf(config, id), runs: b.runs, balls: b.balls, out: b.status === 'out', sr: strikeRate(b.runs, b.balls), fours: b.fours, sixes: b.sixes }));
    const bowls = Object.entries(inn.bowlers).filter(([, b]) => b.balls > 0)
      .sort((x, y) => y[1].wickets - x[1].wickets || x[1].runs - y[1].runs).slice(0, 3)
      .map(([id, b]) => ({ name: nameOf(config, id), wickets: b.wickets, runs: b.runs, overs: formatOvers(b.balls, bpo), econ: (b.runs * bpo) / b.balls }));
    return {
      team: config.teams[inn.battingTeam].name, runs: inn.runs, wickets: inn.wickets, overs: formatOvers(inn.legalBalls, bpo),
      rr: inn.legalBalls ? (inn.runs * bpo) / inn.legalBalls : null, extras: inn.extras, bats, bowls,
    };
  });
  const { status, supers } = summaryView(state);
  return { innings, status, supers, over: state.matchOver };
}

// The big end-of-match graphic: who won and by how much.
export function resultView(state) {
  if (!state.matchOver) return null;
  const { config } = state;
  const lines = state.innings.map((i) => ({ team: config.teams[i.battingTeam].name, score: `${i.runs}/${i.wickets}`, overs: formatOvers(i.legalBalls, config.ballsPerOver) }));
  if (state.winner === null) return { tied: true, title: 'Match tied', sub: '', lines };
  const name = config.teams[state.winner].name;
  const at = state.result.indexOf(`${name} `);
  const sub = at >= 0 ? state.result.slice(at + name.length + 1) : state.result; // "won by 6 runs"
  return { tied: false, title: name, sub, lines };
}

// Batter on strike (for the 50 / 100 graphics).
export function strikerLine(state) {
  const { config, current: inn } = state;
  const id = inn.strikerId ?? inn.nonStrikerId;
  const b = inn.batters[id];
  return id && b ? { name: nameOf(config, id), runs: b.runs, balls: b.balls } : null;
}

// ---------------------------------------------------------------------------------------------------
// Man of the match and milestone alerts.
// ---------------------------------------------------------------------------------------------------

// Everyone's numbers from this match (main innings only), with an impact score used to suggest the Man of the match:
// 1 point per run, 25 per wicket, 10 per catch or run out, and +10 for being on the winning side.
export function playerToday(state) {
  const { config } = state;
  const bpo = config.ballsPerOver;
  const rows = [];
  config.teams.forEach((team, ti) => {
    for (const p of team.players) {
      let bat = null, bowl = null, field = null;
      let runs = 0, wickets = 0, helped = 0;
      for (const inn of state.innings) {
        const b = inn.batters[p.id];
        if (b && (b.balls > 0 || b.status === 'out')) {
          bat = { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, sr: strikeRate(b.runs, b.balls), out: b.status === 'out' };
          runs += b.runs;
        }
        const w = inn.bowlers[p.id];
        if (w && w.balls > 0) {
          bowl = { wickets: w.wickets, runs: w.runs, balls: w.balls, overs: formatOvers(w.balls, bpo), econ: (w.runs * bpo) / w.balls };
          wickets += w.wickets;
        }
        const f = inn.fielding?.[p.id];
        if (f && (f.catches || f.runouts)) {
          field = { catches: (field?.catches ?? 0) + f.catches, runouts: (field?.runouts ?? 0) + f.runouts };
          helped += f.catches + f.runouts;
        }
      }
      if (!bat && !bowl && !field) continue;
      const won = state.matchOver && state.winner === ti;
      rows.push({ id: p.id, name: p.name, team: team.name, teamIdx: ti, bat, bowl, field, won, points: runs + 25 * wickets + 10 * helped + (won ? 10 : 0) });
    }
  });
  return rows.sort((a, b) => b.points - a.points || b.bat?.runs - a.bat?.runs || a.name.localeCompare(b.name));
}

// One-line description of a player's day, e.g. "32 (14) · 2-9 (1.2) · 1 catch".
export function todayLine(r) {
  const out = [];
  if (r.bat) out.push(`${r.bat.runs}${r.bat.out ? '' : '*'} (${r.bat.balls})`);
  if (r.bowl) out.push(`${r.bowl.wickets}-${r.bowl.runs} (${r.bowl.overs})`);
  if (r.field?.catches) out.push(`${r.field.catches} ${plural(r.field.catches, 'catch')}`.replace('catchs', 'catches'));
  if (r.field?.runouts) out.push(`${r.field.runouts} run ${plural(r.field.runouts, 'out')}`);
  return out.join(' · ');
}

// The card shown for the picked Man of the match.
export function motmCard(state, playerId) {
  const rows = playerToday(state);
  const r = rows.find((x) => x.id === playerId);
  if (!r) return null;
  return { ...r, suggested: rows[0]?.id === playerId, line: state.matchOver ? state.result : summaryView(state).status };
}

const RUN_LADDER = [50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const WKT_LADDER = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300];

// Next round number above `total`, the one before it, and the last one passed during this match (if any).
function ladder(steps, total, today) {
  const next = steps.find((m) => m > total) ?? total + 1;
  const prev = [...steps].reverse().find((m) => m <= total) ?? 0;
  const passed = prev > 0 && prev > total - today ? prev : null;
  return { next, prev, passed, gap: next - total };
}

// Career milestone alert for a batter or a bowler, from their saved career stats plus what they have done so far today.
// `career` is the player's entry from /api/stats/players. Returns null when there is nothing to say.
export function milestoneAlert(state, playerId, career, role) {
  const { config } = state;
  const inn = state.current;
  const name = nameOf(config, playerId);
  const teamName = config.teams[role === 'bowl' ? inn.bowlingTeam : inn.battingTeam].name;
  if (!career) return null;
  if (role === 'bowl') {
    const today = inn.bowlers[playerId]?.wickets ?? 0;
    const total = (career.bowling?.wickets ?? 0) + today;
    const L = ladder(WKT_LADDER, total, today);
    const reached = L.passed != null;
    return {
      role, name, teamName,
      kicker: 'Milestone watch',
      big: reached ? String(L.passed) : String(L.gap),
      label: reached ? 'Career wickets reached' : `${plural(L.gap, 'Wicket')} to go`,
      headline: reached ? `${L.passed} career wickets` : `Needs ${L.gap} ${plural(L.gap, 'wicket')} for ${L.next} career wickets`,
      sub: `Career ${career.bowling?.wickets ?? 0} · today ${today}`,
      progress: reached ? 1 : (total - L.prev) / (L.next - L.prev),
      done: reached,
      chips: career.bowling?.wickets != null ? [`${total} career ${plural(total, 'wicket')} now`] : [],
    };
  }
  const today = inn.batters[playerId]?.runs ?? 0;
  const best = career.batting?.highScore ?? null;
  const careerRuns = career.batting?.runs ?? 0;
  const R = ladder(RUN_LADDER, careerRuns + today, today);
  const chips = [R.passed != null ? `Passed ${R.passed} career runs` : `${R.gap} ${plural(R.gap, 'run')} to ${R.next} career runs`];
  if (best) {
    const gap = best - today;
    if (gap > 0) return { role, name, teamName, kicker: 'Milestone watch', big: String(gap), label: `${plural(gap, 'Run')} to go`, headline: `${gap} ${plural(gap, 'run')} from his career best`, sub: `Career best ${best} · today ${today}`, progress: today / best, done: false, chips };
    return {
      role, name, teamName, kicker: 'Milestone', big: String(today), label: gap === 0 ? 'Equals career best' : 'New career best',
      headline: gap === 0 ? 'Equals his career best' : 'A new career best', sub: gap === 0 ? `Career best ${best}` : `Previous best ${best}`, progress: 1, done: true, chips,
    };
  }
  return { role, name, teamName, kicker: 'Milestone watch', big: String(R.gap), label: `${plural(R.gap, 'Run')} to go`, headline: `${R.gap} ${plural(R.gap, 'run')} to ${R.next} career runs`, sub: `Career ${careerRuns} · today ${today}`, progress: (careerRuns + today - R.prev) / (R.next - R.prev), done: false, chips: [] };
}
