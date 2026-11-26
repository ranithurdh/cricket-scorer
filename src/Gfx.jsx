import { useEffect, useState } from 'react';
import { fixed, plural } from './graphicStats';

// The extra stream graphics: pop-up panels (teams, worm graph, matchup, match card) and the full-screen
// moments (transition, FOUR, SIX, WICKET, milestones, result). Pure display: everything shown is passed in.

const COLOURS = ['#386641', '#6a994e', '#587a2c', '#2f5233', '#4d7a5c', '#7d8f3a', '#a08a4a', '#5b6b3a'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// A player's face in a circle, sized in frame units (--s). Initials when there is no photo.
export function Face({ name, photo, s = 4 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  return (
    <span className="gx-face" style={{ '--s': s, '--av': COLOURS[hash(String(name).toLowerCase()) % COLOURS.length] }}>
      {photo && !broken ? <img src={photo} alt="" draggable={false} onError={() => setBroken(true)} /> : String(name).slice(0, 2).toUpperCase()}
    </span>
  );
}

function PanelHead({ title, sub }) {
  return (
    <header className="gx-ph">
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </header>
  );
}

// ---------- Teams: both squads with their faces and batting / bowling rank ----------
function Rank({ label, r, loading }) {
  return (
    <span className={`gx-rk ${r ? (r.place === 1 ? 'first' : '') : 'none'}`} title={r ? `${r.place} of ${r.of} rated · rating ${r.score.toFixed(1)}` : ''}>
      <small>{label}</small>
      <b>{r ? `#${r.place}` : loading ? '…' : '—'}</b>
    </span>
  );
}

function TeamsPanel({ data }) {
  const n = Math.max(1, ...data.teams.map((t) => t.players.length));
  const row = Math.max(2.8, Math.min(4.4, 27 / n));
  return (
    <div className="gx-panel teams" style={{ '--row': row }}>
      <PanelHead title="Teams" sub="Batting and bowling rank" />
      <div className="gx-teams">
        {data.teams.map((t, k) => (
          <section key={k} className="gx-tcol">
            <h3><span>{t.name}</span>{t.batting && <em>Batting</em>}</h3>
            {t.players.map((p) => (
              <div key={p.id} className="gx-pl" style={{ '--i': k * 4 + p.i }}>
                <Face name={p.name} photo={p.photo} s={row - 0.5} />
                <span className="gx-pl-name">{p.name}{!p.saved && <small>guest</small>}</span>
                <Rank label="Bat" r={p.bat} loading={data.loading} />
                <Rank label="Bowl" r={p.bowl} loading={data.loading} />
              </div>
            ))}
            {!t.players.length && <div className="gx-pl none">No players</div>}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- Worm: runs against overs, one line per innings ----------
function WormPanel({ data: v }) {
  const [fresh, setFresh] = useState(true); // wicket dots time themselves to the line drawing in; later ones appear at once
  useEffect(() => { const t = setTimeout(() => setFresh(false), 2400); return () => clearTimeout(t); }, []);
  const W = 1000, H = 400, L = 78, R = 30, T = 18, B = 54;
  const px = (x) => L + (x / v.xMax) * (W - L - R);
  const py = (y) => H - B - (y / v.yMax) * (H - T - B);
  const yTicks = [];
  for (let y = 0; y <= v.yMax; y += v.step) yTicks.push(y);
  const xStep = v.xMax <= 10 ? 1 : v.xMax <= 20 ? 2 : 5;
  const xTicks = [];
  for (let x = xStep; x <= v.xMax; x += xStep) xTicks.push(x);
  const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  return (
    <div className="gx-panel worm">
      <PanelHead title="Comparison" sub="Runs by over" />
      <svg className="gx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score comparison worm graph">
        {yTicks.map((y) => (
          <g key={y} className="gx-grid">
            <line x1={L} x2={W - R} y1={py(y)} y2={py(y)} />
            <text className={y === 0 ? 'gx-axis lab' : ''} x={L - 14} y={py(y) + 8} textAnchor="end">{y === 0 ? 'RUNS' : y}</text>
          </g>
        ))}
        {xTicks.map((x) => <text key={x} className="gx-axis" x={px(x)} y={H - B + 34} textAnchor="middle">{x}</text>)}
        <text className="gx-axis lab" x={L - 14} y={H - B + 34} textAnchor="end">OVERS</text>
        <line className="gx-base" x1={L} x2={W - R} y1={py(0)} y2={py(0)} />
        <line className="gx-base" x1={L} x2={L} y1={T} y2={py(0)} />
        {v.target != null && v.target <= v.yMax && (
          <g className="gx-target">
            <line x1={L} x2={W - R} y1={py(v.target)} y2={py(v.target)} />
            <text x={W - R - 4} y={py(v.target) - 10} textAnchor="end">TARGET {v.target}</text>
          </g>
        )}
        {v.lines.map((l) => {
          const last = l.pts[l.pts.length - 1];
          return (
            <g key={l.k} className={`gx-wline k${l.k}`}>
              {l.pts.length > 1 && <path className="gx-worm-line" d={d(l.pts)} pathLength="1" />}
              {l.wk.map((w, i) => (
                <circle key={i} className="gx-wk" cx={px(w.x)} cy={py(w.y)} r="12" style={{ animationDelay: fresh ? `${0.35 + 1.5 * (w.x / Math.max(last.x, 0.01))}s` : '0s' }} />
              ))}
              {l.pts.length > 1 && <circle className="gx-head" cx={px(last.x)} cy={py(last.y)} r="8" />}
            </g>
          );
        })}
      </svg>
      <div className="gx-legend">
        {v.lines.map((l) => (
          <div key={l.k} className={`gx-lg k${l.k}`}>
            <i />
            <span>{l.team}</span>
            <b>{l.runs}<em>/{l.wickets}</em></b>
            <small>{l.overs} ov</small>
          </div>
        ))}
      </div>
      <div className="gx-pstatus">{v.status}</div>
    </div>
  );
}

// ---------- Matchup: batter v bowler, career (from 1v1) and this match ----------
const dash = (v, f = (x) => x) => (v === null || v === undefined || Number.isNaN(v) ? '—' : f(v));

function MatchupPanel({ data: m }) {
  const c = m.career, t = m.today;
  const rows = [
    ['Balls', dash(c?.balls), dash(t?.balls)],
    ['Runs', dash(c?.runs), dash(t?.runs)],
    ['Strike rate', dash(c?.sr, (x) => fixed(x, 1)), dash(t?.sr, (x) => fixed(x, 1))],
    ['Dismissed', dash(c?.outs), dash(t?.outs)],
    ['4s / 6s', c ? `${c.fours} / ${c.sixes}` : '—', t ? `${t.fours} / ${t.sixes}` : '—'],
    ['Dot ball %', dash(c?.dotPct, (x) => `${fixed(x, 0)}%`), dash(t?.dotPct, (x) => `${fixed(x, 0)}%`)],
  ];
  let line = 'No history between these two yet';
  if (m.status === 'wait') line = 'Waiting for a batter and a bowler';
  else if (m.status === 'loading') line = 'Loading 1v1 history…';
  else if (m.status === 'guest') line = 'Career history is for saved players only';
  else if (m.status === 'offline') line = 'Could not load the 1v1 history';
  else if (c && c.outs > 0) line = `${m.bowler.name} has dismissed ${m.batter.name} ${c.outs} ${plural(c.outs, 'time')} in ${c.innings} ${plural(c.innings, 'innings')}`;
  else if (c && c.balls > 0) line = `${m.batter.name} has not been dismissed by ${m.bowler.name} in ${c.balls} balls`;
  return (
    <div className="gx-panel matchup">
      <PanelHead title="Matchup" sub="Batter v bowler" />
      <div className="gx-mu">
        <div className="gx-mu-side bats">
          <Face name={m.batter.name} photo={m.batter.photo} s={9} />
          <small>Batter</small>
          <b>{m.batter.name}</b>
        </div>
        <div className="gx-mu-mid">
          <div className="gx-mu-vs">V</div>
          <table className="gx-mu-table">
            <thead><tr><th /><th>Career</th><th>This match</th></tr></thead>
            <tbody>
              {rows.map(([label, a, b], i) => (
                <tr key={label} style={{ '--i': i }}><td>{label}</td><td>{a}</td><td>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gx-mu-side bowls">
          <Face name={m.bowler.name} photo={m.bowler.photo} s={9} />
          <small>Bowler</small>
          <b>{m.bowler.name}</b>
        </div>
      </div>
      <div className="gx-pstatus">{line}</div>
    </div>
  );
}

// ---------- Match card: both innings with their best performers ----------
function CardPanel({ data: c }) {
  return (
    <div className="gx-panel summ">
      <PanelHead title="Match summary" sub={c.over ? 'Full time' : 'So far'} />
      <div className="gx-cols">
        {c.innings.map((i, k) => (
          <section key={k} className="gx-icol" style={{ '--i': k }}>
            <div className="gx-ihead">
              <span>{i.team}</span>
              <b>{i.runs}<em>/{i.wickets}</em></b>
              <small>{i.overs} ov{i.rr != null ? ` · RR ${fixed(i.rr, 2)}` : ''} · {i.extras} extras</small>
            </div>
            <div className="gx-lines">
              {i.bats.map((b, j) => (
                <div key={`b${j}`} className="gx-ln"><span>{b.name}</span><b>{b.runs}{b.out ? '' : '*'}<small>({b.balls})</small></b><small>{b.fours}×4 {b.sixes}×6</small></div>
              ))}
              {!i.bats.length && <div className="gx-ln none"><span>Yet to bat</span></div>}
            </div>
            <div className="gx-lines bowls">
              {i.bowls.map((b, j) => (
                <div key={`w${j}`} className="gx-ln"><span>{b.name}</span><b>{b.wickets}-{b.runs}<small>({b.overs})</small></b><small>Econ {fixed(b.econ, 2)}</small></div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {c.supers.map((s, i) => <div key={i} className="gx-pnote">Super over{c.supers.length > 1 ? ` ${i + 1}` : ''}: {s}</div>)}
      <div className="gx-pstatus">{c.status}</div>
    </div>
  );
}

// ---------- Man of the match: the picked player's face and what they did today ----------
const Tile = ({ label, value, sub }) => (
  <div className="gx-mo-tile"><small>{label}</small><b>{value}</b>{sub && <em>{sub}</em>}</div>
);

function MotmPanel({ data: m }) {
  return (
    <div className="gx-panel motm">
      <PanelHead title="Man of the match" sub={m.team} />
      <div className="gx-mo">
        <div className="gx-mo-who">
          <Face name={m.name} photo={m.photo} s={15} />
          <b>{m.name}</b>
          <small>{m.team}</small>
        </div>
        <div className="gx-mo-stats">
          {m.bat && (
            <div className="gx-mo-group" style={{ '--i': 0 }}>
              <span>Batting</span>
              <div>
                <Tile label="Runs" value={`${m.bat.runs}${m.bat.out ? '' : '*'}`} sub={`${m.bat.balls} balls`} />
                <Tile label="4s / 6s" value={`${m.bat.fours} / ${m.bat.sixes}`} />
                <Tile label="Strike rate" value={dash(m.bat.sr, (x) => fixed(x, 1))} />
              </div>
            </div>
          )}
          {m.bowl && (
            <div className="gx-mo-group" style={{ '--i': 1 }}>
              <span>Bowling</span>
              <div>
                <Tile label="Figures" value={`${m.bowl.wickets}-${m.bowl.runs}`} sub={`${m.bowl.overs} ov`} />
                <Tile label="Wickets" value={m.bowl.wickets} />
                <Tile label="Economy" value={dash(m.bowl.econ, (x) => fixed(x, 2))} />
              </div>
            </div>
          )}
          {m.field && (
            <div className="gx-mo-group" style={{ '--i': 2 }}>
              <span>Fielding</span>
              <div>
                <Tile label="Catches" value={m.field.catches} />
                <Tile label="Run outs" value={m.field.runouts} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="gx-pstatus">{m.line}</div>
    </div>
  );
}

export function Panel({ data }) {
  if (data.kind === 'motm') return <MotmPanel data={data} />;
  if (data.kind === 'teams') return <TeamsPanel data={data} />;
  if (data.kind === 'worm') return <WormPanel data={data} />;
  if (data.kind === 'matchup') return <MatchupPanel data={data} />;
  return <CardPanel data={data} />;
}

// ---------- full-screen graphics ----------
const CONFETTI = Array.from({ length: 44 }, (_, i) => {
  const a = ((i * 137.5) % 360) * (Math.PI / 180);
  const r = 14 + ((i * 37) % 30);
  return { x: Math.cos(a) * r * 1.5, y: -Math.abs(Math.sin(a)) * r * 0.9 - 4, rot: ((i * 53) % 720) - 360, d: (i % 9) * 0.035, c: i % 4, w: 0.7 + (i % 3) * 0.35 };
});
const Confetti = ({ count = 44 }) => (
  <div className="gx-confetti" aria-hidden="true">
    {CONFETTI.slice(0, count).map((b, i) => (
      <i key={i} className={`c${b.c}`} style={{ '--x': b.x, '--y': b.y, '--r': `${b.rot}deg`, '--d': `${b.d}s`, '--w': b.w }} />
    ))}
  </div>
);

const Ball = () => (
  <svg className="gx-ballsvg" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" />
    <path d="M7 11c7 5 7 13 0 18M33 11c-7 5-7 13 0 18" />
  </svg>
);

const Stumps = () => (
  <svg className="gx-stumps" viewBox="0 0 90 100" aria-hidden="true">
    <rect className="st s1" x="13" y="28" width="11" height="68" rx="4" />
    <rect className="st s2" x="39.5" y="28" width="11" height="68" rx="4" />
    <rect className="st s3" x="66" y="28" width="11" height="68" rx="4" />
    <rect className="bail b1" x="11" y="21" width="30" height="6" rx="3" />
    <rect className="bail b2" x="49" y="21" width="30" height="6" rx="3" />
  </svg>
);

const Trophy = () => (
  <svg className="gx-trophy" viewBox="0 0 120 140" aria-hidden="true">
    <path className="cup" d="M30 8h60v40a30 30 0 0 1-60 0z" />
    <path className="han" d="M30 20H12v14a24 24 0 0 0 24 24M90 20h18v14a24 24 0 0 1-24 24" />
    <rect className="cup" x="53" y="78" width="14" height="26" />
    <rect className="base" x="32" y="104" width="56" height="16" rx="4" />
    <path className="shine" d="M44 20v26" />
  </svg>
);

function Band({ small, word, sub, children }) {
  return (
    <div className="gx-band">
      <div className="gx-band-in">
        {children}
        <div className="gx-band-text">
          <small>{small}</small>
          <b>{word}</b>
          {sub && <span>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function Fx({ fx }) {
  const k = fx.kind;
  if (k === 'transition') {
    return (
      <div className="gx-fx transition">
        <i className="b1" /><i className="b2" /><i className="b3" />
        <div className="gx-tr-title"><span>{fx.a}</span><b>v</b><span>{fx.b}</span></div>
      </div>
    );
  }
  if (k === 'four') {
    return (
      <div className="gx-fx splash four">
        <div className="gx-rays"><i /></div>
        <div className="gx-streak"><Ball /></div>
        <Band small="Boundary" word="FOUR" sub={fx.sub} />
      </div>
    );
  }
  if (k === 'six') {
    return (
      <div className="gx-fx splash six">
        <div className="gx-rays"><i /></div>
        <div className="gx-lift"><Ball /></div>
        <Band small="Maximum" word="SIX" sub={fx.sub} />
        <Confetti />
      </div>
    );
  }
  if (k === 'wicket') {
    return (
      <div className="gx-fx splash wicket">
        <div className="gx-flash" />
        <Band small={fx.how ?? 'Wicket'} word="WICKET" sub={fx.sub}><Stumps /></Band>
      </div>
    );
  }
  if (k === 'fifty' || k === 'hundred') {
    const hundred = k === 'hundred';
    return (
      <div className={`gx-fx splash mile ${k}`}>
        <div className="gx-rays"><i /></div>
        <div className="gx-medal">
          <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="ring" cx="100" cy="100" r="90" pathLength="1" /><circle className="ring2" cx="100" cy="100" r="76" /></svg>
          <b>{hundred ? '100' : '50'}</b>
        </div>
        <div className="gx-mile-text">
          <small>{hundred ? 'Century' : 'Half century'}</small>
          <b>{fx.name ?? ''}</b>
          {fx.sub && <span>{fx.sub}</span>}
        </div>
        {hundred && <Confetti count={30} />}
      </div>
    );
  }
  if (k === 'freehit' || k === 'hattrick') {
    return (
      <div className={`gx-fx splash stamp ${k}`}>
        <div className="gx-rays"><i /></div>
        <Band small={k === 'freehit' ? 'No ball' : 'On a hat-trick'} word={k === 'freehit' ? 'FREE HIT' : 'HAT-TRICK'} sub={fx.sub} />
      </div>
    );
  }
  // result
  const r = fx.result;
  const parts = r.sub.split(/(\d+)/);
  return (
    <div className="gx-fx result">
      <div className="gx-rs-bg" />
      <div className="gx-rs-stripes"><i /><i /><i /></div>
      <div className="gx-rs-body">
        {!r.tied && <Trophy />}
        <small className="gx-rs-kicker">{r.tied ? 'Full time' : 'Match result'}</small>
        <h2>{r.title}</h2>
        {r.sub && <div className="gx-rs-won">{parts.map((t, i) => (/^\d+$/.test(t) ? <em key={i}>{t}</em> : t))}</div>}
        <div className="gx-rs-scores">{r.lines.map((l, i) => <span key={i}>{l.team} <b>{l.score}</b> <small>({l.overs})</small></span>)}</div>
      </div>
      {!r.tied && <Confetti count={44} />}
    </div>
  );
}

// ---------- Milestone alert: a lower-third style card in the top left ----------
export function AlertCard({ a }) {
  return (
    <div className={`gx-alert ${a.done ? 'done' : ''}`}>
      <div className="gx-alert-top">
        <Face name={a.name} photo={a.photo} s={8.5} />
        <div className="gx-alert-who">
          <small>{a.kicker}</small>
          <b>{a.name}</b>
          <span>{a.teamName}</span>
        </div>
        <div className="gx-alert-big"><b>{a.big}</b><small>{a.label}</small></div>
      </div>
      <div className="gx-alert-head">{a.headline}</div>
      <div className="gx-alert-bar"><i style={{ '--p': Math.max(0.03, Math.min(1, a.progress)) }} /></div>
      <div className="gx-alert-sub"><span>{a.sub}</span>{a.chips.map((c) => <em key={c}>{c}</em>)}</div>
    </div>
  );
}
