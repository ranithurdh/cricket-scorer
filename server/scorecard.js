// Full scorecard for one match, built from config + events. Unlike the stored player rows this includes
// guests too, because the Matches page shows everyone who played.
import { computeState, formatOvers, nameOf } from '../src/engine.js';
import { DEFAULT_ROSTER } from '../src/members.js';

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

export function scorecard(config, events, roster = DEFAULT_ROSTER) {
  const state = computeState(config, events);
  const bpo = config.ballsPerOver;

  // Saved players get their current spelling and face; guests are shown as typed.
  const person = (name) => {
    const e = roster.find(name);
    return { name: e?.name ?? String(name).trim(), photo: e?.photo ?? null, member: !!e };
  };
  const name = (id) => person(nameOf(config, id)).name;

  const winner = state.winner; // team index, or null for a tie / unfinished match (a super over decides a tie)

  const howOut = (bt) => {
    if (bt.status === 'retired') return 'retired';
    if (bt.status !== 'out') return 'not out';
    const o = bt.out, bowler = o.bowlerId ? name(o.bowlerId) : null, f = o.fielderId ? name(o.fielderId) : null;
    switch (o.kind) {
      case 'bowled': return `b ${bowler}`;
      case 'caught': return `c ${f ?? '?'} b ${bowler}`;
      case 'stumped': return `st ${f ?? '?'} b ${bowler}`;
      case 'runout': return f ? `run out (${f})` : 'run out';
      default: return bowler ? `out (b ${bowler})` : 'out';
    }
  };

  const buildInnings = (inn) => {
    const batting = [], didNotBat = [];
    for (const p of config.teams[inn.battingTeam].players) {
      const bt = inn.batters[p.id];
      if (bt.status === 'yet' && bt.balls === 0) { didNotBat.push(name(p.id)); continue; }
      batting.push({
        name: name(p.id), runs: bt.runs, balls: bt.balls, fours: bt.fours, sixes: bt.sixes,
        strikeRate: bt.balls ? round((bt.runs / bt.balls) * 100, 1) : null,
        out: bt.status === 'out', how: howOut(bt),
      });
    }
    const bowling = Object.entries(inn.bowlers)
      .filter(([, bw]) => bw.balls > 0 || bw.runs > 0)
      .map(([id, bw]) => ({
        name: name(id), overs: formatOvers(bw.balls, bpo), runs: bw.runs, wickets: bw.wickets,
        economy: bw.balls ? round(bw.runs / (bw.balls / bpo), 2) : null, dots: bw.dots, extras: bw.extras,
      }));
    return {
      team: config.teams[inn.battingTeam].name, runs: inn.runs, wickets: inn.wickets,
      overs: formatOvers(inn.legalBalls, bpo), extras: inn.extras, batting, didNotBat, bowling,
    };
  };
  const innings = state.innings.map(buildInnings);
  const superOvers = state.superOvers.map((so) => ({
    winner: so.winner === null ? null : config.teams[so.winner].name,
    innings: so.innings.map(buildInnings),
  }));

  return {
    result: state.result,
    winner: winner === null ? null : config.teams[winner].name,
    overs: config.overs, ballsPerOver: bpo,
    teams: config.teams.map((t, i) => {
      const inn = state.innings.find((x) => x.battingTeam === i);
      return {
        name: t.name,
        won: state.matchOver ? (winner === null ? null : winner === i) : null,
        score: inn ? { runs: inn.runs, wickets: inn.wickets, overs: formatOvers(inn.legalBalls, bpo) } : null,
        superScores: state.superOvers.flatMap((so) => so.innings.filter((x) => x.battingTeam === i).map((x) => ({ runs: x.runs, wickets: x.wickets }))),
        players: t.players.map((p) => person(p.name)),
      };
    }),
    innings,
    superOvers,
  };
}
