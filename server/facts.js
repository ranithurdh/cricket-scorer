// Per-match "facts" the Home and 1v1 pages need but the saved player rows don't hold: hat-tricks, the best
// partnership, maidens, stumpings and every batter-vs-bowler matchup. Worked out ONCE when a match is saved and
// stored on the match, so the stats pages add up small stored numbers instead of replaying every match's balls.
// Saved players only (guests are skipped). Pure JS so it can be tested in node.
import { computeState, nameOf } from '../src/engine.js';

export const FACTS_VERSION = 1; // bump when this file's maths changes; the server then rebuilds the stored facts

const round4 = (v) => Math.round(v * 10000) / 10000;
const EMPTY = { pairs: [], people: [], hattricks: [], partnership: null };

export function matchFacts(config, events, roster) {
  let state;
  try { state = computeState(config, events); } catch { return { ...EMPTY }; }
  const bpo = config.ballsPerOver;
  const nm = (id) => (id ? roster.find(nameOf(config, id))?.name ?? null : null); // null = guest

  const pairs = new Map(), people = new Map(), hat = new Map();
  const person = (n) => { if (!people.has(n)) people.set(n, { name: n, maidens: 0, stumpings: 0 }); return people.get(n); };
  let partnership = null;

  for (const inn of state.innings) {
    const batTeam = config.teams[inn.battingTeam].name;
    const bowlTeam = config.teams[inn.bowlingTeam].name;
    let legalSoFar = 0;
    const overs = new Map();     // over number -> who bowled it and what it cost
    const touched = new Set();   // matchups seen this innings (for the innings count)
    const streaks = new Map();   // bowler -> victims in their current run of wickets

    for (const b of inn.log) {
      const bat = nm(b.strikerId), bowl = nm(b.bowlerId);
      const charged = b.batRuns + (b.extra === 'wide' || b.extra === 'noball' ? b.extraRuns : 0); // what the bowler is charged
      const idx = Math.floor(legalSoFar / bpo);
      const o = overs.get(idx) ?? { legal: 0, bowlers: new Set(), charged: 0 };
      o.bowlers.add(b.bowlerId); o.charged += charged; if (b.legal) o.legal += 1;
      overs.set(idx, o);
      if (b.legal) legalSoFar += 1;

      if (b.wicket?.credited && b.wicket.kind === 'stumped') {
        const keeper = nm(b.wicket.fielderId);
        if (keeper) person(keeper).stumpings += 1;
      }

      // Hat-trick: three wickets in a row from the same bowler's own deliveries. A wide or no-ball that takes no
      // wicket isn't a delivery here, so it doesn't break a streak. A run out is not the bowler's wicket and breaks
      // it. Four in a row is still one hat-trick (the streak starts again after it).
      if (b.legal || b.wicket?.credited) {
        const s = streaks.get(b.bowlerId) ?? [];
        if (b.wicket?.credited) s.push(b.wicket.outId); else s.length = 0;
        streaks.set(b.bowlerId, s);
        if (s.length >= 3) { if (bowl) hat.set(bowl, (hat.get(bowl) ?? 0) + 1); s.length = 0; }
      }

      if (!bat || !bowl) continue; // guests don't get matchups
      const key = `${bat}\u0000${bowl}`;
      const a = pairs.get(key) ?? { bat, bowl, innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, outs: 0, bRuns: 0, legal: 0, oversEq: 0, bDots: 0 };
      pairs.set(key, a);
      if (!touched.has(key)) { touched.add(key); a.innings += 1; }
      if (b.extra !== 'wide') { a.balls += 1; if (b.batRuns === 0) a.dots += 1; }   // batter faced it
      a.runs += b.batRuns;
      if (b.batRuns === 4) a.fours += 1;
      if (b.batRuns === 6) a.sixes += 1;
      if (b.wicket?.credited) a.outs += 1;                                             // run outs aren't the bowler's
      a.bRuns += charged;
      if (b.legal) { a.legal += 1; a.oversEq = round4(a.oversEq + 1 / bpo); if (b.batRuns + b.extraRuns === 0) a.bDots += 1; }
    }

    // a maiden: a full over, all by one bowler, that cost him nothing (byes and leg byes aren't charged to the bowler)
    for (const o of overs.values()) {
      if (o.legal === bpo && o.bowlers.size === 1 && o.charged === 0) {
        const name = nm([...o.bowlers][0]);
        if (name) person(name).maidens += 1;
      }
    }

    // Partnership: all the runs (extras included) scored while the same two batters are together.
    let pair = null;
    const close = () => {
      if (!pair) return;
      const pa = nm(pair.a), pb = nm(pair.b);
      if (pa && pb && (!partnership || pair.runs > partnership.runs || (pair.runs === partnership.runs && pair.balls < partnership.balls))) {
        partnership = { players: [pa, pb], runs: pair.runs, balls: pair.balls, team: batTeam, against: bowlTeam };
      }
      pair = null;
    };
    for (const b of inn.log) {
      if (!b.strikerId || !b.nonStrikerId) { close(); continue; } // a batter on their own isn't a partnership
      const key = [b.strikerId, b.nonStrikerId].sort().join('|');
      if (!pair || pair.key !== key) { close(); pair = { key, a: b.strikerId, b: b.nonStrikerId, runs: 0, balls: 0 }; }
      pair.runs += b.batRuns + b.extraRuns;
      if (b.legal) pair.balls += 1;
    }
    close();
  }

  return {
    pairs: [...pairs.values()],
    people: [...people.values()],
    hattricks: [...hat].map(([name, count]) => ({ name, count })),
    partnership,
  };
}

// The stored facts if the match has them, otherwise work them out now (old data, tests).
export const factsFor = (m, roster) => m.facts ?? matchFacts(m.config, m.events ?? [], roster);
