import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlayerStats } from './api';
import Avatar from './Avatar';
import { overallRatings, MIN, MIN_LABEL, progress } from './ratings';

// Each section lists its stats. `better` says which direction wins the rank; `get` reads the value.
const f1 = (v) => (v == null ? '—' : v.toFixed(1));
const f2 = (v) => (v == null ? '—' : v.toFixed(2));
const int = (v) => (v == null ? '—' : String(v));
const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

const SECTIONS = {
  batting: {
    label: 'Batting', noun: 'batter', accent: 'var(--hunter)', on: 'var(--ivory)', start: 'average',
    has: (p) => p.batting.innings > 0,
    sub: (p) => `${p.batting.runs} runs · ${p.batting.innings} inn`,
    stats: [
      { key: 'average', label: 'Average', get: (p) => p.batting.average, fmt: f2, better: 'high', hint: 'Runs per dismissal' },
      { key: 'strikeRate', label: 'Strike rate', short: 'SR', get: (p) => p.batting.strikeRate, fmt: f1, better: 'high', hint: 'Runs per 100 balls' },
      { key: 'highScore', label: 'High score', short: 'HS', get: (p) => p.batting.highScore, fmt: int, better: 'high', hint: 'Best individual innings' },
      { key: 'fours', label: 'Most 4s', short: '4s', get: (p) => p.batting.fours, fmt: int, better: 'high', hint: 'Total fours hit' },
      { key: 'sixes', label: 'Most 6s', short: '6s', get: (p) => p.batting.sixes, fmt: int, better: 'high', hint: 'Total sixes hit' },
      { key: 'boundaryPct', label: 'Boundary %', short: 'Bdry %', get: (p) => p.batting.boundaryPct, fmt: pct, better: 'high', hint: 'Balls faced hit for 4 or 6' },
      { key: 'dotPct', label: 'Dot ball %', short: 'Dot %', bad: true, get: (p) => p.batting.dotPct, fmt: pct, better: 'low', hint: 'Balls faced with no runs off the bat' },
    ],
  },
  bowling: {
    label: 'Bowling', noun: 'bowler', accent: 'var(--sage)', on: 'var(--forest)', start: 'wickets',
    has: (p) => p.bowling.balls > 0,
    sub: (p) => `${p.bowling.overs} ov · ${p.bowling.runs} runs`,
    stats: [
      { key: 'wickets', label: 'Wickets', short: 'Wkts', wkt: true, get: (p) => p.bowling.wickets, fmt: int, better: 'high', hint: 'Wickets taken' },
      { key: 'average', label: 'Average', get: (p) => p.bowling.average, fmt: f2, better: 'low', hint: 'Runs conceded per wicket' },
      { key: 'economy', label: 'Economy', short: 'Econ', get: (p) => p.bowling.economy, fmt: f2, better: 'low', hint: 'Runs conceded per over' },
      { key: 'dotPct', label: 'Dot ball %', short: 'Dot %', get: (p) => p.bowling.dotPct, fmt: pct, better: 'high', hint: 'Legal balls with no runs at all' },
      { key: 'extras', label: 'Extras', bad: true, get: (p) => p.bowling.extras, fmt: int, better: 'low', hint: 'Runs given from wides and no-balls' },
    ],
  },
  fielding: {
    label: 'Fielding', noun: 'fielder', accent: 'var(--moss)', on: 'var(--ivory)', start: 'catches',
    has: (p) => p.matches > 0,
    sub: (p) => `${p.matches} match${p.matches === 1 ? '' : 'es'}`,
    stats: [
      { key: 'catches', label: 'Catches', get: (p) => p.fielding.catches, fmt: int, better: 'high', hint: 'Catches taken' },
      { key: 'runouts', label: 'Run outs', short: 'Run outs', get: (p) => p.fielding.runouts, fmt: int, better: 'high', hint: 'Run outs effected' },
      { key: 'drops', label: 'Dropped', bad: true, get: (p) => p.fielding.drops, fmt: int, better: 'low', hint: 'Catches dropped' },
      { key: 'catchPct', label: 'Catch %', short: 'Catch %', get: (p) => p.fielding.catchPct, fmt: pct, better: 'high', hint: 'Catches taken ÷ chances (taken + dropped)' },
    ],
  },
};

// The default sort: a 0-100 rating blending every stat in the section (see ratings.js).
const OVERALL = {
  key: 'overall', label: 'Overall', short: 'Rating', fmt: f1, better: 'high',
  hint: 'Weighted blend of every stat on this board, 0–100',
};

function rank(players, section, stat, ratings) {
  const dir = stat.better === 'low' ? 1 : -1;
  const read = stat.key === 'overall' ? (p) => ratings.map.get(p.name)?.score ?? null : stat.get;
  const rows = players.map((p) => ({ p, v: read(p), data: section.has(p) }));
  rows.sort((a, b) => {
    if (a.data !== b.data) return a.data ? -1 : 1;            // players with no data in this section go last
    if ((a.v == null) !== (b.v == null)) return a.v == null ? 1 : -1;
    if (a.v !== b.v && a.v != null) return (a.v - b.v) * dir;
    return b.p.matches - a.p.matches || a.p.name.localeCompare(b.p.name);
  });
  // bar length: 1 = best value on the board, scaled down for everyone else
  const vals = rows.filter((r) => r.data && r.v != null).map((r) => r.v);
  const best = vals.length ? (stat.better === 'low' ? Math.min(...vals) : Math.max(...vals)) : null;
  return rows.map((r, i) => ({
    ...r,
    // an unrated player (below the minimum) shows no place on the overall board
    place: r.data && (r.v != null || stat.key !== 'overall') ? i + 1 : null,
    bar: r.v == null || best == null ? 0
      : stat.better === 'low' ? (r.v === 0 ? 1 : Math.min(1, best / r.v)) : best === 0 ? 0 : Math.max(0, r.v / best),
  }));
}

export default function Leaderboards() {
  const [players, setPlayers] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('batting');
  const [sortKey, setSortKey] = useState({ batting: 'overall', bowling: 'overall', fielding: 'overall' });

  const load = useCallback(() => {
    setError('');
    fetchPlayerStats().then(setPlayers).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const section = SECTIONS[tab];
  const stat = [OVERALL, ...section.stats].find((s) => s.key === sortKey[tab]) ?? OVERALL;
  // ratings for all three boards, for the active board
  const all = useMemo(() => (players
    ? Object.fromEntries(Object.entries(SECTIONS).map(([k, sec]) => [k, overallRatings(players, k, sec.has)]))
    : null), [players]);
  const ratings = all?.[tab];
  const rows = useMemo(() => (players ? rank(players, section, stat, ratings) : []), [players, section, stat, ratings]);
  const anyData = players?.some((p) => p.matches > 0);
  const podium = rows.filter((r) => r.place && r.place <= 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean); // 2nd, 1st, 3rd

  const bad = stat.bad || stat.wkt; // red for wickets and bad stats
  const accent = bad ? 'var(--brick)' : section.accent;
  const on = bad ? '#fff' : section.on;

  return (
    <div className="lb" style={{ '--accent': accent, '--on': on }}>
      <div className="page-title">
        <div>
          <h1>Leaderboards</h1>
          <small>Saved players · completed matches only</small>
        </div>
        <button className="chip-btn" onClick={load}>Refresh</button>
      </div>

      <div className="seg" role="tablist">
        {Object.entries(SECTIONS).map(([k, s]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`seg-btn cut ${tab === k ? 'on' : ''}`} style={{ '--accent': s.accent, '--on': s.on }} onClick={() => setTab(k)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="sort-row">
        <small>Rank by</small>
        <div className="chips">
          {[OVERALL, ...section.stats].map((s) => (
            <button key={s.key} className={`chip ${s.key === stat.key ? 'on' : ''}`} title={s.hint} onClick={() => setSortKey((k) => ({ ...k, [tab]: s.key }))}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint-line">
        {stat.hint} · {stat.better === 'low' ? 'lower is better' : 'higher is better'}
        {stat.key === 'overall' && ratings && (ratings.relaxed
          ? ` · not enough players have ${MIN[tab]} ${MIN_LABEL[tab]} yet, so everyone with data is rated`
          : ` · rated once a player has ${MIN[tab]} ${MIN_LABEL[tab]}`)}
      </p>

      {error && (
        <div className="notice bad">
          <b>Can't reach the server.</b> Start it with <code>npm run dev:server</code> (and MongoDB), then retry. <small>Error: {error}</small>
          <button className="chip-btn" onClick={load}>Retry</button>
        </div>
      )}
      {!error && !players && <div className="notice">Loading stats…</div>}
      {players && !anyData && (
        <div className="notice">No completed matches yet. Finish a match and the board fills up.</div>
      )}

      {players && podiumOrder.length > 0 && (
        <div className="podium">
          {podiumOrder.map((r) => (
            <div key={r.p.name} className={`pod pod${r.place} cut`}>
              <span className="pod-rank">{r.place}</span>
              <Avatar name={r.p.name} photo={r.p.photo} size={r.place === 1 ? 56 : 44} />
              <b className="pod-name">{r.p.name}</b>
              <span className="pod-val">{stat.fmt(r.v)}</span>
              <small>{stat.short ?? stat.label}</small>
            </div>
          ))}
        </div>
      )}

      <div className="rows">
        {rows.map((r) => (
          <article key={r.p.name} className={`lb-row cut ${r.data ? '' : 'dim'}`}>
            <div className="row-head">
              <span className="place">{r.place ?? '–'}</span>
              <Avatar name={r.p.name} photo={r.p.photo} />
              <div className="who">
                <b>{r.p.name}</b>
                <small>{r.data ? section.sub(r.p) : r.p.matches ? 'Did not play this role yet' : 'No matches yet'}</small>
              </div>
              <div className="main-stat">
                <b>{stat.fmt(r.v)}</b>
                <small>{r.data && r.v == null && stat.key === 'overall'
                  ? `needs ${Math.max(0, Math.ceil((MIN[tab] - progress(tab, r.p)) * 10) / 10)} more ${MIN_LABEL[tab]}`
                  : (stat.short ?? stat.label)}</small>
              </div>
            </div>
            <div className="bar"><i style={{ width: `${Math.round(r.bar * 100)}%` }} /></div>
            <div className="stat-grid" style={{ gridTemplateColumns: `repeat(${section.stats.length}, 1fr)` }}>
              {section.stats.map((s) => (
                <div key={s.key} className={`stat ${s.key === stat.key ? 'hot' : ''} ${s.bad ? 'bad' : ''} ${s.wkt ? 'wkt' : ''}`}>
                  <b>{s.fmt(s.get(r.p))}</b>
                  <small>{s.short ?? s.label}</small>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
