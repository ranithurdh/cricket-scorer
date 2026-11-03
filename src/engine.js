// Pure scoring engine: state = computeState(config, events). No React in here.
// Events: select{role,playerId} | ball{runs,extra,wicket} | retire{playerId} | drop{playerId} | end_innings | next_innings | super_over | no_super_over

const BOWLER_CREDIT = ['bowled', 'caught', 'stumped', 'other'];
export const validKinds = (extra) =>
  extra === 'wide'
    ? ['stumped', 'runout']
    : extra
      ? ['runout']
      : ['bowled', 'caught', 'stumped', 'other', 'runout'];
export const players = (config, team) => config.teams[team].players;
export const nameOf = (config, id) =>
  config.teams.flatMap((t) => t.players).find((p) => p.id === id)?.name ?? '';
export const formatOvers = (balls, bpo) => `${Math.floor(balls / bpo)}.${balls % bpo}`;
const maxWickets = (config, team) => players(config, team).length - (config.lastManBats ? 0 : 1);

function newInnings(config, battingTeam) {
  const fresh = () => ({ runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, status: 'yet', out: null });
  return {
    battingTeam,
    bowlingTeam: 1 - battingTeam,
    runs: 0, wickets: 0, legalBalls: 0, extras: 0,
    strikerId: null, nonStrikerId: null, bowlerId: null, prevBowlerId: null,
    batters: Object.fromEntries(players(config, battingTeam).map((p) => [p.id, fresh()])),
    bowlers: {}, fielding: {}, overBalls: [], overComplete: false, closed: false, alone: false,
    log: [], // every ball actually applied, in order (used for records like hat-tricks and first fifties)
  };
}

// Fielding tally for one player on the bowling side: { catches, runouts, drops }.
const fielder = (inn, id) => (inn.fielding[id] ??= { catches: 0, runouts: 0, drops: 0 });

// A dropped catch, logged by the scorer. Only counts for someone on the fielding side.
function drop(config, inn, { playerId }) {
  if (players(config, inn.bowlingTeam).some((p) => p.id === playerId)) fielder(inn, playerId).drops += 1;
}

function select(inn, { role, playerId }) {
  if (role === 'bowler') {
    inn.bowlerId = playerId;
    inn.bowlers[playerId] ??= { balls: 0, runs: 0, wickets: 0, dots: 0, extras: 0 };
    return;
  }
  if (!inn.batters[playerId]) return;
  const key = role === 'striker' ? 'strikerId' : 'nonStrikerId';
  const old = inn.batters[inn[key]];
  if (old && old.status === 'in') old.status = old.balls > 0 ? 'retired' : 'yet';
  inn[key] = playerId;
  inn.batters[playerId].status = 'in';
}

function retire(inn, id) {
  if (!inn.batters[id]) return;
  inn.batters[id].status = 'retired';
  if (inn.strikerId === id) inn.strikerId = null;
  else if (inn.nonStrikerId === id) inn.nonStrikerId = null;
}

function applyBall(config, inn, ev, target) {
  const { runs = 0, extra = null, wicket = null } = ev;
  const striker = inn.batters[inn.strikerId];
  const bowler = inn.bowlers[inn.bowlerId];
  if (!striker || !bowler || (!inn.nonStrikerId && !inn.alone)) return; // selections missing
  if (inn.overComplete) { inn.overBalls = []; inn.overComplete = false; }

  let batRuns = 0, extraRuns = 0, legal = true;
  if (extra === 'wide') { extraRuns = config.wideRuns + runs; legal = false; }
  else if (extra === 'noball') { extraRuns = config.noBallRuns; batRuns = runs; legal = false; }
  else if (extra === 'bye' || extra === 'legbye') extraRuns = runs;
  else batRuns = runs;

  inn.runs += batRuns + extraRuns;
  inn.extras += extraRuns;
  if (extra !== 'wide') striker.balls += 1;
  striker.runs += batRuns;
  if (batRuns === 4) striker.fours += 1;
  if (batRuns === 6) striker.sixes += 1;
  bowler.runs += batRuns + (extra === 'wide' || extra === 'noball' ? extraRuns : 0);
  if (legal) { bowler.balls += 1; inn.legalBalls += 1; }
  if (extra !== 'wide' && batRuns === 0) striker.dots += 1;           // batter faced it and scored nothing off the bat
  if (legal && batRuns + extraRuns === 0) bowler.dots += 1;           // nothing at all came off a legal ball
  if (extra === 'wide' || extra === 'noball') bowler.extras += extraRuns; // wides/no-balls are the bowler's; byes aren't

  const strikerAtBall = inn.strikerId, nonStrikerAtBall = inn.nonStrikerId;
  let wicketRec = null, credited = false;
  const out = wicket && inn.batters[wicket.outId];
  if (out && out.status === 'in' && validKinds(extra).includes(wicket.kind)) {
    const credit = BOWLER_CREDIT.includes(wicket.kind);
    out.status = 'out';
    out.out = { kind: wicket.kind, bowlerId: credit ? inn.bowlerId : null, fielderId: wicket.fielderId ?? null };
    inn.wickets += 1;
    credited = credit;
    if (credit) bowler.wickets += 1;
    if (wicket.fielderId && wicket.kind === 'caught') fielder(inn, wicket.fielderId).catches += 1;
    if (wicket.fielderId && wicket.kind === 'runout') fielder(inn, wicket.fielderId).runouts += 1;
    if (inn.strikerId === wicket.outId) inn.strikerId = null; else inn.nonStrikerId = null;
    wicketRec = { ...wicket };
    if (config.lastManBats && inn.wickets === players(config, inn.battingTeam).length - 1) {
      inn.alone = true; // last batter carries on alone, no partner, no strike changes
      if (!inn.strikerId) { inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = null; }
    }
  }

  inn.overBalls.push({ runs, extra, batRuns, extraRuns, legal, wicket: wicketRec, bowlerId: inn.bowlerId });
  inn.log.push({
    bowlerId: inn.bowlerId, strikerId: strikerAtBall, nonStrikerId: nonStrikerAtBall, legal, extra, batRuns, extraRuns,
    strikerRuns: striker.runs, strikerBalls: striker.balls, // the striker's totals after this ball
    wicket: wicketRec ? { outId: wicketRec.outId, kind: wicketRec.kind, fielderId: wicketRec.fielderId ?? null, credited } : null,
  });

  const swap = () => { if (!inn.alone) [inn.strikerId, inn.nonStrikerId] = [inn.nonStrikerId, inn.strikerId]; };
  if (runs % 2 === 1) swap(); // odd runs: batters cross
  if (legal && inn.legalBalls % config.ballsPerOver === 0) {
    swap(); // end of over
    inn.prevBowlerId = inn.bowlerId;
    inn.bowlerId = null;
    inn.overComplete = true;
  }

  if (inn.legalBalls >= config.overs * config.ballsPerOver) inn.closed = true;
  if (inn.wickets >= maxWickets(config, inn.battingTeam)) inn.closed = true;
  if (target && inn.runs >= target) inn.closed = true;
}

// One innings' worth of events. `list` is the innings so far (1 or 2), `firstBat` who bats first in it.
function feed(cfg, list, firstBat, ev) {
  const inn = list[list.length - 1];
  const target = list.length === 2 ? list[0].runs + 1 : null;
  if (ev.type === 'next_innings') {
    if (inn.closed && list.length === 1) list.push(newInnings(cfg, 1 - firstBat));
  } else if (!inn.closed) {
    if (ev.type === 'select') select(inn, ev);
    else if (ev.type === 'retire') retire(inn, ev.playerId);
    else if (ev.type === 'drop') drop(cfg, inn, ev);
    else if (ev.type === 'ball') applyBall(cfg, inn, ev, target);
    else if (ev.type === 'end_innings') inn.closed = true;
  }
}
const finished = (list) => list.length === 2 && list[1].closed;
// Team index that won a finished pair of innings, or null for a tie.
const winnerOf = (list) => {
  const [a, b] = list;
  return b.runs > a.runs ? b.battingTeam : b.runs < a.runs ? a.battingTeam : null;
};

// Super over events: super_over (start one after a tie) | no_super_over (keep the tie). A super over is a
// second mini-match of one over each, stored in the same event log, so it belongs to the same match.
// The team that batted second bats first; if a super over ties, another can follow with the order swapped.
// The main innings stay in `innings` (player stats use only those); super overs are in `superOvers`.
export function computeState(config, events) {
  const innings = [newInnings(config, config.battingFirst)];
  const supers = []; // { cfg, firstBat, innings }
  let declined = false;

  for (const ev of events) {
    const cur = supers[supers.length - 1];
    if (ev.type === 'super_over' || ev.type === 'no_super_over') {
      const list = cur ? cur.innings : innings;
      const tied = finished(list) && winnerOf(list) === null;
      if (!tied || declined) continue;
      if (ev.type === 'no_super_over') { declined = true; continue; }
      const firstBat = supers.length % 2 === 0 ? 1 - config.battingFirst : config.battingFirst;
      const cfg = { ...config, overs: 1 };
      supers.push({ cfg, firstBat, innings: [newInnings(cfg, firstBat)] });
    } else if (!cur) feed(config, innings, config.battingFirst, ev);
    else if (!finished(cur.innings)) feed(cur.cfg, cur.innings, cur.firstBat, ev);
  }

  const last = supers[supers.length - 1];
  const list = last ? last.innings : innings;
  const cfg = last ? last.cfg : config;
  const current = list[list.length - 1];
  const target = list.length === 2 ? list[0].runs + 1 : null;
  const mainOver = finished(innings);
  const matchOver = last ? finished(last.innings) : mainOver;
  const winner = matchOver ? winnerOf(list) : null; // team index, or null for a tie / unfinished

  let result = null;
  if (matchOver) {
    const [a, b] = innings;
    const nameA = config.teams[a.battingTeam].name, nameB = config.teams[b.battingTeam].name;
    result = b.runs > a.runs ? `${nameB} won by ${maxWickets(config, b.battingTeam) - b.wickets} wickets`
      : b.runs < a.runs ? `${nameA} won by ${a.runs - b.runs} runs` : 'Match tied';
    if (last) {
      result = winner === null ? 'Match tied, super over tied'
        : `Match tied, ${config.teams[winner].name} won ${supers.length > 1 ? `in super over ${supers.length}` : 'the super over'}`;
    }
  }
  let needs = null;
  if (!current.closed) {
    needs = !current.strikerId ? 'striker' : !current.nonStrikerId && !current.alone ? 'nonStriker' : !current.bowlerId ? 'bowler' : null;
  }
  return {
    config, innings, current, target, matchOver, result, needs, winner,
    superOvers: supers.map((s) => ({ innings: s.innings, done: finished(s.innings), winner: finished(s.innings) ? winnerOf(s.innings) : null })),
    inSuper: supers.length > 0 && !matchOver,    // a super over is being played right now
    offerSuper: matchOver && winner === null && !declined, // tied: ask whether to play (another) super over
    oversLimit: cfg.overs,
    need: target ? Math.max(0, target - current.runs) : null,
    ballsLeft: cfg.overs * cfg.ballsPerOver - current.legalBalls,
  };
}
