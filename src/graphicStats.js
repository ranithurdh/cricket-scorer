// Pure helpers for the stream graphic (no React). Everything is derived from computeState().
import { formatOvers, nameOf, players } from './engine.js';

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


// ---- worm graph ----

// Runs against overs for each innings, ball by ball. x is overs as a decimal (3.5 = 3 overs and 3 of 6 balls),
// y is the total. Wides and no-balls add runs without moving along, so they show as a step up.
export function wormData(state) {
  const bpo = state.config.ballsPerOver;
  const lines = state.innings.map((inn) => {
    const points = [{ x: 0, y: 0 }];
    const wickets = [];
    let legal = 0;
    for (const e of inn.log) {
      if (e.legal) legal += 1;
      const x = legal / bpo;
      points.push({ x, y: e.runsAfter }); // a wide or no-ball repeats x, so it draws as a step straight up
      if (e.wicketsAfter > (wickets.length)) wickets.push({ x, y: e.runsAfter });
    }
    return {
      team: state.config.teams[inn.battingTeam].name, points, wickets,
      runs: inn.runs, outs: inn.wickets, overs: formatOvers(inn.legalBalls, bpo), balls: inn.log.length, closed: !!inn.closed,
    };
  });
  return { lines, maxOvers: state.oversLimit, target: state.target ?? null };
}

// The line under the worm graph.
export function wormNote(state) {
  const inn = state.current;
  const team = state.config.teams[inn.battingTeam].name;
  if (state.matchOver && state.result) return state.result;
  if (state.target) return `${team} need ${state.need} more ${plural(state.need, 'run')} to win from ${state.ballsLeft} ${plural(state.ballsLeft, 'ball')}`;
  return `${team} ${inn.runs}-${inn.wickets} after ${formatOvers(inn.legalBalls, state.config.ballsPerOver)} overs`;
}
