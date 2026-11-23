// Logic behind the match editor (EditMatch.jsx). No React in here.
// A match is its event list, so every edit is "make a new event list": change one ball, flag it, or remove a drop.
// Nothing is written until the editor saves the whole list.
import { computeState, formatOvers } from './engine';

export const KIND_LABEL = { bowled: 'Bowled', caught: 'Caught', stumped: 'Stumped', other: 'Other', runout: 'Run out' };

// Every innings that has balls in it: the two main innings, then any super over innings.
export function allSections(state, config) {
  const team = (inn) => config.teams[inn.battingTeam].name;
  const secs = state.innings.map((inn, i) => ({
    key: `i${i}`, short: i === 0 ? '1st innings' : '2nd innings', title: `${team(inn)} batting`, inn,
  }));
  state.superOvers.forEach((so, n) => so.innings.forEach((inn, i) => secs.push({
    key: `s${n}-${i}`, short: `Super over${state.superOvers.length > 1 ? ` ${n + 1}` : ''}${so.innings.length > 1 ? (i ? ' reply' : '') : ''}`,
    title: `Super over: ${team(inn)} batting`, inn, superOver: true,
  })));
  return secs;
}
export const allLogs = (state) => [...state.innings, ...state.superOvers.flatMap((s) => s.innings)].flatMap((i) => i.log);

// One innings as overs, each holding its balls and dropped catches in the order they happened.
export function timeline(inn, bpo) {
  const items = [
    ...inn.log.map((b) => ({ kind: 'ball', idx: b.idx, b })),
    ...inn.dropLog.map((d) => ({ kind: 'drop', idx: d.idx, d })),
  ].sort((a, b) => a.idx - b.idx);
  const overs = [];
  let cur = null;
  for (const it of items) {
    const no = it.kind === 'ball' ? it.b.over : cur ? cur.no : 1;
    if (!cur || cur.no !== no) { cur = { no, items: [], runs: 0, wickets: 0, legal: 0, bowlers: [] }; overs.push(cur); }
    if (it.kind === 'ball') {
      const { b } = it;
      if (b.legal) cur.legal += 1;
      it.label = `${no - 1}.${cur.legal}`;
      cur.runs += b.batRuns + b.extraRuns;
      if (b.wicket) cur.wickets += 1;
      if (!cur.bowlers.includes(b.bowlerId)) cur.bowlers.push(b.bowlerId);
    }
    cur.items.push(it);
  }
  return overs;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// What the ball looked like: a short token for the badge and a sentence for the row.
export function describeBall(b, nameOf) {
  const total = b.batRuns + b.extraRuns;
  let text;
  if (b.extra === 'wide') text = `Wide, ${plural(total, 'run')}`;
  else if (b.extra === 'noball') text = `No ball${b.batRuns ? `, ${plural(b.batRuns, 'run')} off the bat` : ''}`;
  else if (b.extra === 'bye') text = total ? `${plural(total, 'bye')}` : 'Bye';
  else if (b.extra === 'legbye') text = total ? `${plural(total, 'leg bye')}` : 'Leg bye';
  else text = total === 0 ? 'Dot ball' : plural(total, 'run');
  if (b.wicket) {
    const w = b.wicket;
    const how = KIND_LABEL[w.kind] ?? w.kind;
    const by = w.fielderId ? ` (${nameOf(w.fielderId)})` : '';
    text += ` · OUT: ${nameOf(w.outId)} ${how.toLowerCase()}${by}`;
  }
  const short = { wide: 'Wd', noball: 'Nb', bye: 'B', legbye: 'Lb' }[b.extra] ?? '';
  const cls = b.wicket ? 'wicket' : b.batRuns >= 4 ? 'boundary' : b.extra ? 'extra' : total === 0 ? 'dot' : 'run';
  return { text, main: b.wicket ? 'W' : total === 0 ? '•' : String(total), short, cls };
}

// ---- edits (each returns a NEW event list) ----

// f: { runs, extra, wicket: null | { kind, outId, fielderId }, countBall, countWicket, keepStrike }
// Changing between odd and even runs would move the strike for every later ball. With keepStrike a no-ball "swap"
// event is placed right after this ball so the later balls are still faced by the same batters as before.
export const flipsStrike = (oldRuns, newRuns) => ((oldRuns ?? 0) % 2) !== ((newRuns ?? 0) % 2);
export function editBall(events, idx, f) {
  const old = events[idx];
  const ev = { ...old, type: 'ball', runs: f.runs, extra: f.extra || null };
  delete ev.wicket; delete ev.statsOff;
  if (f.wicket) {
    ev.wicket = { kind: f.wicket.kind, outId: f.wicket.outId, fielderId: f.wicket.fielderId ?? null };
    if (!f.countWicket) ev.wicket.noStats = true;
  }
  if (!f.countBall) ev.statsOff = true;
  let out = events.map((e, i) => (i === idx ? ev : e));
  if (f.keepStrike && flipsStrike(old.runs, f.runs)) {
    const next = out[idx + 1];
    out = next?.type === 'swap' && next.fix
      ? out.filter((_, i) => i !== idx + 1)                              // this undoes an earlier compensation
      : [...out.slice(0, idx + 1), { type: 'swap', fix: true }, ...out.slice(idx + 1)];
  }
  return out;
}

// Flip "this ball counts in player stats". Flags never change the match itself.
export function toggleBallFlag(events, idx) {
  return events.map((e, i) => {
    if (i !== idx) return e;
    const ev = { ...e };
    if (ev.statsOff) delete ev.statsOff; else ev.statsOff = true;
    return ev;
  });
}
// Flip "this wicket counts in player stats".
export function toggleWicketFlag(events, idx) {
  return events.map((e, i) => {
    if (i !== idx || !e.wicket) return e;
    const wicket = { ...e.wicket };
    if (wicket.noStats) delete wicket.noStats; else wicket.noStats = true;
    return { ...e, wicket };
  });
}
export const removeEvent = (events, idx) => events.filter((_, i) => i !== idx);

// ---- safety checks ----

const ballCount = (events) => events.filter((e) => e.type === 'ball').length;
const lostBalls = (config, events) => ballCount(events) - allLogs(computeState(config, events)).length;

// Compare an edited list with the one before it. `lost` = balls that would stop counting because the edit made
// them impossible (for example a new wicket with nobody selected to replace the batter, or a normal ball turned into
// a wide, which moves every later over). `strikeChanges` = balls that would now be faced by a different batter.
export function compare(config, before, after) {
  const lost = Math.max(0, lostBalls(config, after) - lostBalls(config, before));
  const byIdx = (events) => allLogs(computeState(config, events)).sort((a, b) => a.idx - b.idx);
  const was = byIdx(before), now = byIdx(after);
  let strikeChanges = 0;
  for (let i = 0; i < Math.min(was.length, now.length); i++) if (was[i].strikerId !== now[i].strikerId) strikeChanges += 1;
  return { lost, strikeChanges };
}

// The scoreboard lines of a match, used to show what an edit does to the result.
export function scoreLines(state, config) {
  const bpo = config.ballsPerOver;
  const lines = state.innings.map((i) => `${config.teams[i.battingTeam].name} ${i.runs}/${i.wickets} (${formatOvers(i.legalBalls, bpo)})`);
  return { lines, result: state.result };
}

export const flaggedCount = (events) =>
  events.filter((e) => e.type === 'ball' && (e.statsOff || e.wicket?.noStats)).length;
