import { useEffect, useMemo, useState } from 'react';
import { fetchPlayerStats, fetchVersus } from './api';
import { overallRatings, MIN, MIN_LABEL, progress } from './ratings';
import { formatOvers } from './engine';
import Avatar from './Avatar';

const dash = (v, fmt) => (v == null ? '—' : fmt(v));
const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const pct = (v) => `${v.toFixed(0)}%`;
const ratio = (n, d) => (d > 0 ? n / d : null);

const hasBat = (p) => p.batting.innings > 0;
const hasBowl = (p) => p.bowling.balls > 0;
const hasField = (p) => p.matches > 0;
const MIN_BALLS = 6; // matchups with fewer balls than this don't count for the "best / worst rate" cards

// Place on the Overall-rating board (same order as the Leaderboards page).
function rankOf(players, section, has, me) {
  const { map } = overallRatings(players, section, has);
  const score = (p) => map.get(p.name)?.score ?? null;
  const rated = players.filter((p) => score(p) != null)
    .sort((a, b) => score(b) - score(a) || b.matches - a.matches || a.name.localeCompare(b.name));
  const i = rated.findIndex((p) => p.name === me.name);
  return { place: i >= 0 ? i + 1 : null, of: rated.length, score: score(me), has: has(me) };
}

const pick = (rows, get, dir = 'high', ok = () => true) => {
  const c = rows.filter((r) => ok(r) && get(r) != null);
  if (!c.length) return null;
  return c.reduce((a, b) => ((dir === 'high' ? get(b) > get(a) : get(b) < get(a)) ? b : a));
};

const batRow = (r) => ({
  ...r,
  sr: ratio(r.runs * 100, r.balls), avg: ratio(r.runs, r.outs), dotPct: ratio(r.dots * 100, r.balls), econ: ratio(r.bRuns, r.oversEq),
});
const bowlRow = (r) => ({
  ...r,
  econ: ratio(r.bRuns, r.oversEq), avg: ratio(r.bRuns, r.outs), dotPct: ratio(r.bDots * 100, r.legal), sr: ratio(r.runs * 100, r.balls),
  boundaries: r.fours + r.sixes,
});

function Tile({ label, value, cls = '' }) {
  return <div className={`stat ${cls}`}><b>{value}</b><small>{label}</small></div>;
}

function Section({ title, accent, children }) {
  return (
    <section className="card vs-sec" style={{ '--accent': accent }}>
      <h2 className="vs-h">{title}</h2>
      {children}
    </section>
  );
}

function RankCard({ label, r, section }) {
  let big = '—', sub = 'No data yet';
  if (r.has && r.place) { big = `#${r.place}`; sub = `of ${r.of} rated · rating ${r.score.toFixed(1)}`; }
  else if (r.has) {
    big = 'Unrated';
    sub = `needs ${Math.max(0, Math.ceil((MIN[section] - progress(section, r.me)) * 10) / 10)} more ${MIN_LABEL[section]}`;
  }
  return <div className="rank-card cut"><small>{label}</small><b>{big}</b><small>{sub}</small></div>;
}

function Fact({ icon, title, row, value, detail }) {
  if (!row) return null;
  return (
    <article className="rec cut vs-fact">
      <div className="rec-title"><span aria-hidden="true">{icon}</span><small>{title}</small></div>
      <div className="rec-body">
        <Avatar name={row.opponent} photo={row.photo} size={38} />
        <div className="rec-who"><b>{row.opponent}</b><small>{detail}</small></div>
        <span className="rec-value">{value}</span>
      </div>
    </article>
  );
}

function SortChips({ options, value, onChange }) {
  return (
    <div className="sort-row">
      <small>Sort by</small>
      <div className="chips">
        {options.map((o) => <button key={o.key} className={`chip ${o.key === value ? 'on' : ''}`} onClick={() => onChange(o.key)}>{o.label}</button>)}
      </div>
    </div>
  );
}

const BAT_SORTS = [
  { key: 'runs', label: 'Runs', get: (r) => r.runs },
  { key: 'sr', label: 'Strike rate', get: (r) => r.sr ?? -1 },
  { key: 'fours', label: '4s', get: (r) => r.fours },
  { key: 'sixes', label: '6s', get: (r) => r.sixes },
  { key: 'outs', label: 'Got out', get: (r) => r.outs },
];
const BOWL_SORTS = [
  { key: 'outs', label: 'Wickets', get: (r) => r.outs },
  { key: 'runs', label: 'Runs scored off him', get: (r) => r.runs },
  { key: 'bDots', label: 'Dots', get: (r) => r.bDots },
  { key: 'boundaries', label: 'Boundaries', get: (r) => r.boundaries },
  { key: 'econ', label: 'Economy (best first)', get: (r) => -(r.econ ?? Infinity) },
];

export default function Versus() {
  const [players, setPlayers] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(null);
  const [v, setV] = useState(null);        // matchup data for the selected player
  const [vError, setVError] = useState('');
  const [batSort, setBatSort] = useState('runs');
  const [bowlSort, setBowlSort] = useState('outs');

  useEffect(() => { fetchPlayerStats().then(setPlayers).catch((e) => setError(e.message)); }, []);

  useEffect(() => {
    if (!name) return undefined;
    let stale = false;
    setV(null); setVError('');
    fetchVersus(name).then((d) => { if (!stale) setV(d); }).catch((e) => { if (!stale) setVError(e.message); });
    return () => { stale = true; };
  }, [name]);

  const me = players?.find((p) => p.name === name) ?? null;
  const ranks = useMemo(() => (me ? {
    bat: { ...rankOf(players, 'batting', hasBat, me), me },
    bowl: { ...rankOf(players, 'bowling', hasBowl, me), me },
    field: { ...rankOf(players, 'fielding', hasField, me), me },
  } : null), [players, me]);

  const bat = useMemo(() => (v ? v.batting.map(batRow) : []), [v]);
  const bowl = useMemo(() => (v ? v.bowling.map(bowlRow) : []), [v]);
  const sortRows = (rows, sorts, key) => {
    const s = sorts.find((x) => x.key === key);
    return [...rows].sort((a, b) => s.get(b) - s.get(a) || b.balls - a.balls || a.opponent.localeCompare(b.opponent));
  };
  const batRows = sortRows(bat, BAT_SORTS, batSort);
  const bowlRows = sortRows(bowl, BOWL_SORTS, bowlSort);

  const bf = v?.bestFigures;
  const pending = !v && !vError ? '…' : null;

  return (
    <div className="lb">
      <div className="page-title">
        <div>
          <h1>1v1</h1>
          <small>Pick a player · saved players · completed matches only</small>
        </div>
        <button className="chip-btn" onClick={() => { setPlayers(null); setError(''); fetchPlayerStats().then(setPlayers).catch((e) => setError(e.message)); if (name) { const n = name; setName(null); setTimeout(() => setName(n), 0); } }}>Refresh</button>
      </div>

      {error && <div className="notice bad"><b>Can't reach the server.</b> Start it with <code>npm run dev:server</code> (and MongoDB), then retry.</div>}
      {!error && !players && <div className="notice">Loading players…</div>}

      {players && (
        <div className="vs-players" role="listbox" aria-label="Players">
          {players.map((p) => (
            <button key={p.name} role="option" aria-selected={p.name === name} className={`vs-player cut ${p.name === name ? 'on' : ''}`} onClick={() => setName(p.name)}>
              <Avatar name={p.name} photo={p.photo} size={44} />
              <b>{p.name}</b>
            </button>
          ))}
        </div>
      )}
      {players && !name && <div className="notice">Tap a player to see their stats and how they've fared against everyone else.</div>}

      {me && (
        <>
          <div className="vs-head">
            <Avatar name={me.name} photo={me.photo} size={60} />
            <div>
              <h2 className="vs-name">{me.name}</h2>
              <small>{me.matches} match{me.matches === 1 ? '' : 'es'} · {me.wins} won · {me.losses} lost</small>
            </div>
          </div>
          {me.matches === 0 && <div className="notice">{me.name} hasn't played a completed match yet.</div>}

          <Section title="Batting" accent="var(--hunter)">
            <div className="vs-tiles">
              <Tile label="Total runs" value={me.batting.runs} />
              <Tile label="Average" value={dash(me.batting.average, f2)} />
              <Tile label="Strike rate" value={dash(me.batting.strikeRate, f1)} />
              <Tile label="Highest score" value={dash(me.batting.highScore, String)} />
            </div>
          </Section>

          <Section title="Bowling" accent="var(--sage)">
            <div className="vs-tiles five">
              <Tile label="Wickets" value={me.bowling.wickets} cls="wkt" />
              <Tile label="Average" value={dash(me.bowling.average, f2)} />
              <Tile label="Economy" value={dash(me.bowling.economy, f2)} />
              <Tile label="Maidens" value={v ? v.maidens : (pending ?? '—')} />
              <Tile label="Best figures" value={bf ? `${bf.wickets}/${bf.runs}` : (v ? '—' : (pending ?? '—'))} />
            </div>
            {bf && <small className="vs-note">Best figures came in {formatOvers(bf.balls, bf.ballsPerOver)} overs. A maiden is a full over from one bowler that cost him no runs (byes don't count against him).</small>}
          </Section>

          <Section title="Fielding" accent="var(--moss)">
            <div className="vs-tiles">
              <Tile label="Catches" value={me.fielding.catches} />
              <Tile label="Run outs" value={me.fielding.runouts} />
              <Tile label="Dropped" value={me.fielding.drops} cls="bad" />
              <Tile label="Stumpings" value={v ? v.stumpings : (pending ?? '—')} />
            </div>
          </Section>

          <Section title="Rank out of everyone" accent="var(--lime)">
            <div className="rank-grid">
              <RankCard label="Batters" r={ranks.bat} section="batting" />
              <RankCard label="Bowlers" r={ranks.bowl} section="bowling" />
              <RankCard label="Fielders" r={ranks.field} section="fielding" />
            </div>
            <small className="vs-note">Ranked by the Overall rating on each Leaderboards board.</small>
          </Section>

          {vError && <div className="notice bad"><b>Couldn't load the matchups.</b> {vError}</div>}
          {!v && !vError && <div className="notice">Loading matchups…</div>}

          {v && (
            <>
              <Section title={`${me.name} batting vs each bowler`} accent="var(--hunter)">
                {bat.length === 0 ? <p className="home-none">{me.name} hasn't faced anyone else in the dorm yet.</p> : (
                  <>
                    <div className="rec-grid">
                      <Fact icon="🏏" title="Scored most runs off" row={pick(bat, (r) => r.runs, 'high', (r) => r.runs > 0)} value={pick(bat, (r) => r.runs, 'high', (r) => r.runs > 0)?.runs} detail={`off ${pick(bat, (r) => r.runs, 'high', (r) => r.runs > 0)?.balls} balls`} />
                      <Fact icon="⚡" title="Best strike rate against" row={pick(bat, (r) => r.sr, 'high', (r) => r.balls >= MIN_BALLS && r.runs > 0)} value={dash(pick(bat, (r) => r.sr, 'high', (r) => r.balls >= MIN_BALLS && r.runs > 0)?.sr, f1)} detail={`${pick(bat, (r) => r.sr, 'high', (r) => r.balls >= MIN_BALLS && r.runs > 0)?.runs} off ${pick(bat, (r) => r.sr, 'high', (r) => r.balls >= MIN_BALLS && r.runs > 0)?.balls} (min ${MIN_BALLS} balls)`} />
                      <Fact icon="🧱" title="Hardest to score off" row={bat.filter((r) => r.balls >= MIN_BALLS).length > 1 ? pick(bat, (r) => r.sr, 'low', (r) => r.balls >= MIN_BALLS) : null} value={dash(pick(bat, (r) => r.sr, 'low', (r) => r.balls >= MIN_BALLS)?.sr, f1)} detail={`${pick(bat, (r) => r.sr, 'low', (r) => r.balls >= MIN_BALLS)?.runs} off ${pick(bat, (r) => r.sr, 'low', (r) => r.balls >= MIN_BALLS)?.balls} (min ${MIN_BALLS} balls)`} />
                      <Fact icon="4️⃣" title="Most fours off" row={pick(bat, (r) => r.fours, 'high', (r) => r.fours > 0)} value={pick(bat, (r) => r.fours, 'high', (r) => r.fours > 0)?.fours} detail="fours hit" />
                      <Fact icon="6️⃣" title="Most sixes off" row={pick(bat, (r) => r.sixes, 'high', (r) => r.sixes > 0)} value={pick(bat, (r) => r.sixes, 'high', (r) => r.sixes > 0)?.sixes} detail="sixes hit" />
                      <Fact icon="☠️" title="Got him out most" row={pick(bat, (r) => r.outs, 'high', (r) => r.outs > 0)} value={`${pick(bat, (r) => r.outs, 'high', (r) => r.outs > 0)?.outs}×`} detail="dismissals (run outs aren't the bowler's)" />
                      <Fact icon="🔇" title="Most dot balls faced from" row={pick(bat, (r) => r.dots, 'high', (r) => r.dots > 0)} value={pick(bat, (r) => r.dots, 'high', (r) => r.dots > 0)?.dots} detail={`${dash(pick(bat, (r) => r.dots, 'high', (r) => r.dots > 0)?.dotPct, pct)} of balls faced`} />
                    </div>

                    <SortChips options={BAT_SORTS} value={batSort} onChange={setBatSort} />
                    <div className="rows">
                      {batRows.map((r) => (
                        <article key={r.opponent} className="lb-row cut">
                          <div className="row-head">
                            <Avatar name={r.opponent} photo={r.photo} />
                            <div className="who"><b>vs {r.opponent}</b><small>{r.innings} innings · {r.balls} ball{r.balls === 1 ? '' : 's'} faced</small></div>
                            <div className="main-stat"><b>{r.runs}</b><small>runs</small></div>
                          </div>
                          <div className="stat-grid vs-grid">
                            <Tile label="SR" value={dash(r.sr, f1)} cls={batSort === 'sr' ? 'hot' : ''} />
                            <Tile label="Avg" value={dash(r.avg, f1)} />
                            <Tile label="4s" value={r.fours} cls={batSort === 'fours' ? 'hot' : ''} />
                            <Tile label="6s" value={r.sixes} cls={batSort === 'sixes' ? 'hot' : ''} />
                            <Tile label="Dot %" value={dash(r.dotPct, pct)} />
                            <Tile label="Out" value={r.outs} cls={`bad ${batSort === 'outs' ? 'hot' : ''}`} />
                            <Tile label="Their econ" value={dash(r.econ, f2)} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </Section>

              <Section title={`${me.name} bowling to each batter`} accent="var(--sage)">
                {bowl.length === 0 ? <p className="home-none">{me.name} hasn't bowled to anyone else in the dorm yet.</p> : (
                  <>
                    <div className="rec-grid">
                      <Fact icon="🎯" title="Most wickets against" row={pick(bowl, (r) => r.outs, 'high', (r) => r.outs > 0)} value={pick(bowl, (r) => r.outs, 'high', (r) => r.outs > 0)?.outs} detail="wickets (run outs aren't his)" />
                      <Fact icon="💥" title="Scored most runs against him" row={pick(bowl, (r) => r.runs, 'high', (r) => r.runs > 0)} value={pick(bowl, (r) => r.runs, 'high', (r) => r.runs > 0)?.runs} detail={`off ${pick(bowl, (r) => r.runs, 'high', (r) => r.runs > 0)?.balls} balls`} />
                      <Fact icon="🔇" title="Most dot balls to" row={pick(bowl, (r) => r.bDots, 'high', (r) => r.bDots > 0)} value={pick(bowl, (r) => r.bDots, 'high', (r) => r.bDots > 0)?.bDots} detail={`${dash(pick(bowl, (r) => r.bDots, 'high', (r) => r.bDots > 0)?.dotPct, pct)} of his balls`} />
                      <Fact icon="🚀" title="Hit him for most boundaries" row={pick(bowl, (r) => r.boundaries, 'high', (r) => r.boundaries > 0)} value={pick(bowl, (r) => r.boundaries, 'high', (r) => r.boundaries > 0)?.boundaries} detail={`${pick(bowl, (r) => r.boundaries, 'high', (r) => r.boundaries > 0)?.fours} fours · ${pick(bowl, (r) => r.boundaries, 'high', (r) => r.boundaries > 0)?.sixes} sixes`} />
                      <Fact icon="🧊" title="Best economy against" row={pick(bowl, (r) => r.econ, 'low', (r) => r.legal >= MIN_BALLS)} value={dash(pick(bowl, (r) => r.econ, 'low', (r) => r.legal >= MIN_BALLS)?.econ, f2)} detail={`${pick(bowl, (r) => r.econ, 'low', (r) => r.legal >= MIN_BALLS)?.bRuns} runs in ${pick(bowl, (r) => r.econ, 'low', (r) => r.legal >= MIN_BALLS)?.legal} balls (min ${MIN_BALLS})`} />
                      <Fact icon="💸" title="Most expensive against" row={bowl.filter((r) => r.legal >= MIN_BALLS).length > 1 ? pick(bowl, (r) => r.econ, 'high', (r) => r.legal >= MIN_BALLS) : null} value={dash(pick(bowl, (r) => r.econ, 'high', (r) => r.legal >= MIN_BALLS)?.econ, f2)} detail={`${pick(bowl, (r) => r.econ, 'high', (r) => r.legal >= MIN_BALLS)?.bRuns} runs in ${pick(bowl, (r) => r.econ, 'high', (r) => r.legal >= MIN_BALLS)?.legal} balls (min ${MIN_BALLS})`} />
                    </div>

                    <SortChips options={BOWL_SORTS} value={bowlSort} onChange={setBowlSort} />
                    <div className="rows">
                      {bowlRows.map((r) => (
                        <article key={r.opponent} className="lb-row cut">
                          <div className="row-head">
                            <Avatar name={r.opponent} photo={r.photo} />
                            <div className="who"><b>to {r.opponent}</b><small>{r.innings} innings · {r.legal} legal ball{r.legal === 1 ? '' : 's'}</small></div>
                            <div className="main-stat"><b>{r.outs}</b><small>wicket{r.outs === 1 ? '' : 's'}</small></div>
                          </div>
                          <div className="stat-grid vs-grid">
                            <Tile label="Runs off" value={r.runs} cls={bowlSort === 'runs' ? 'hot' : ''} />
                            <Tile label="Econ" value={dash(r.econ, f2)} cls={bowlSort === 'econ' ? 'hot' : ''} />
                            <Tile label="Avg" value={dash(r.avg, f1)} />
                            <Tile label="Dots" value={r.bDots} cls={bowlSort === 'bDots' ? 'hot' : ''} />
                            <Tile label="Dot %" value={dash(r.dotPct, pct)} />
                            <Tile label="4s" value={r.fours} cls={bowlSort === 'boundaries' ? 'hot' : ''} />
                            <Tile label="6s" value={r.sixes} cls={bowlSort === 'boundaries' ? 'hot' : ''} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
