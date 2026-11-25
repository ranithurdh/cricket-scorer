import { useEffect, useRef, useState } from 'react';
import { formatOvers, nameOf } from './engine';
import PlayerProfile, { CountUp } from './Profile';
import { ballToken, bowlerLine, fixed, partnership, plural, strikeRate, summaryView, targetView } from './graphicStats';

// Everything drawn on the green screen. Sizes are in --u (1% of a 16:9 frame), so it scales with the stage.

function TeamBlock({ state }) {
  const { config, current: inn } = state;
  return (
    <div className="gx-team">
      <span className="gx-tag">{config.teams[inn.battingTeam].name}</span>
      <b className="gx-score" key={`${inn.runs}-${inn.wickets}`}>{inn.runs}<i>/{inn.wickets}</i></b>
      <span className="gx-ov">{formatOvers(inn.legalBalls, config.ballsPerOver)}<em> / {state.oversLimit} ov</em></span>
      {state.inSuper && <span className="gx-so">Super over</span>}
    </div>
  );
}

function OverBalls({ inn, bpo }) {
  // Over finished and the next bowler already picked: start the new over with empty boxes (the old over stays up until then).
  const balls = inn.overComplete && inn.bowlerId ? [] : inn.overBalls;
  const tokens = balls.map(ballToken);
  const left = Math.max(0, bpo - balls.filter((b) => b.legal).length); // wides and no-balls add a box but don't use one up
  for (let i = 0; i < left; i++) tokens.push({ main: '', sub: '', cls: 'empty' });
  return (
    <div className="gx-balls">
      {tokens.map((t, i) => <div key={`${i}${t.cls}${t.main}${t.sub}`} className={`gx-tok ${t.cls}`} style={{ '--k': i }}>{t.main}{t.sub && <small>{t.sub}</small>}</div>)}
    </div>
  );
}

function LiveBody({ state }) {
  const { config, current: inn } = state;
  const bpo = config.ballsPerOver;
  const bat = (id, star) => {
    const b = inn.batters[id];
    if (!b) return inn.alone ? null : <div className="gx-bat dim"><span className="gx-name">—</span></div>;
    return (
      <div className={`gx-bat ${star ? 'on' : 'dim'}`}>
        <span className="gx-name">{star && <em className="ptr">▶</em>}{nameOf(config, id)}</span>
        <b>{b.runs}<small>({b.balls})</small></b>
      </div>
    );
  };
  const bw = inn.bowlers[inn.bowlerId];
  return (
    <div className="gx-body live">
      <div className="gx-batters">{bat(inn.strikerId, true)}{bat(inn.nonStrikerId, false)}</div>
      <div className="gx-bowler">
        <div className="gx-bat bowl">
          <span className="gx-name"><em className="ptr">●</em>{nameOf(config, inn.bowlerId) || '—'}</span>
          <b>{bw ? `${bw.wickets}-${bw.runs}` : ''}<small>{bw ? `(${formatOvers(bw.balls, bpo)})` : ''}</small></b>
        </div>
        <OverBalls inn={inn} bpo={bpo} />
      </div>
    </div>
  );
}

function BattersBody({ state }) {
  const { config, current: inn } = state;
  const p = partnership(inn);
  const cell = (id, star) => {
    const b = inn.batters[id];
    if (!b) return null;
    return (
      <div key={id} className={`gx-bcell ${star ? 'on' : 'dim'}`}>
        <div className="gx-bwho">
          <span className="gx-name">{star && <em className="ptr">▶</em>}{nameOf(config, id)}</span>
          <small>{b.fours}×4 · {b.sixes}×6 · SR {fixed(strikeRate(b.runs, b.balls))}</small>
        </div>
        <b>{b.runs}<small>({b.balls})</small></b>
      </div>
    );
  };
  return (
    <div className="gx-body batters">
      {cell(inn.strikerId, true)}
      {cell(inn.nonStrikerId, false)}
      <div className="gx-bcell part">
        <div className="gx-bwho"><span className="gx-name">Partnership</span></div>
        <b>{p.runs}<small>({p.balls})</small></b>
      </div>
    </div>
  );
}

function BowlerBody({ state }) {
  const { config, current: inn } = state;
  const bpo = config.ballsPerOver;
  const line = bowlerLine(inn, inn.bowlerId, bpo);
  const tile = (label, value, cls = '') => <div className={`gx-tile ${cls}`}><b>{value}</b><small>{label}</small></div>;
  return (
    <div className="gx-body bowl">
      <span className="gx-name big"><em className="ptr">●</em>{nameOf(config, inn.bowlerId) || '—'}</span>
      <div className="gx-tiles five">
        {tile('Overs', line ? line.overs : '-')}
        {tile('Runs', line ? line.runs : '-')}
        {tile('Wickets', line ? line.wickets : '-', 'wkt')}
        {tile('Econ', fixed(line?.econ, 2))}
        {tile('Dots', line ? line.dots : '-')}
      </div>
      <OverBalls inn={inn} bpo={bpo} />
    </div>
  );
}

const Tile = ({ label, value, cls = '' }) => <div className={`gx-tile ${cls}`}><b>{value}</b><small>{label}</small></div>;

function TargetStats({ v }) {
  if (v.kind === 'projected') {
    return (
      <div className="gx-stats">
        <Tile label="Run rate" value={fixed(v.crr, 2)} />
        <Tile label="Overs left" value={v.oversLeft} />
        <Tile label="Wkts in hand" value={v.inHand} />
      </div>
    );
  }
  if (v.kind === 'set') {
    return (
      <div className="gx-stats">
        <Tile label="Target" value={v.target} cls="hot" />
        <Tile label={`${v.from} scored`} value={v.score} />
      </div>
    );
  }
  return (
    <div className="gx-stats">
      <Tile label="Target" value={v.target} />
      <Tile label="Req. rate" value={fixed(v.rrr, 2)} cls="hot" />
      <Tile label="Run rate" value={fixed(v.crr, 2)} />
      <Tile label="Wkts in hand" value={v.inHand} />
    </div>
  );
}

function TargetBody({ v }) {
  if (v.kind === 'result') return <div className="gx-body result"><b className="gx-result">{v.text}</b></div>;
  const set = v.kind === 'set';
  return (
    <div className="gx-body target">
      {v.kind === 'projected' ? (
        <div className="gx-need">
          <div><span>Projected score</span><b>{v.projected ?? '-'}</b><span>at this rate</span></div>
        </div>
      ) : (
        <div className="gx-need">
          <div>
            <span>Need</span><b>{v.need}</b><span>{plural(v.need, 'run')}</span>
            <span>from</span><b>{v.left}</b><span>{plural(v.left, 'ball')}</span>
          </div>
          {set && <small className="gx-for">{v.team} to chase</small>}
        </div>
      )}
      <TargetStats v={v} />
    </div>
  );
}

function SummaryBody({ state }) {
  const { rows, status, supers } = summaryView(state);
  return (
    <div className="gx-body summary">
      {rows.map((r, i) => (
        <div key={i} className={`gx-sum ${r.live ? 'live' : ''}`}>
          <span className="gx-name">{r.team}</span>
          <b className="gx-sum-score">{r.runs}<i>/{r.wickets}</i><small>({r.overs})</small></b>
          <span className="gx-best">
            {r.bat && <span>{r.bat.name} {r.bat.runs}{r.bat.out ? '' : '*'}<small>({r.bat.balls})</small></span>}
            {r.bowl && <span>{r.bowl.name} {r.bowl.wickets}-{r.bowl.runs}</span>}
          </span>
        </div>
      ))}
      {supers.map((s, i) => <div key={`so${i}`} className="gx-sum so"><span className="gx-name">Super over{supers.length > 1 ? ` ${i + 1}` : ''}</span><span className="gx-best"><span>{s}</span></span></div>)}
      <div className="gx-status">{status}</div>
    </div>
  );
}

// Keeps the last value on screen while its exit animation plays, so hiding anything animates too.
function useLeave(value, ms = 600) {
  const [held, setHeld] = useState(value);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (value) { setHeld(value); setLeaving(false); return undefined; }
    if (!held) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setHeld(null); setLeaving(false); }, ms);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return [held, leaving];
}

function ProfileSlot({ profile }) {
  const [held, leaving] = useLeave(profile);
  if (!held) return null;
  return <div className={`gx-prof-wrap ${leaving ? 'out' : ''}`} key={held.id}><PlayerProfile profile={held} /></div>;
}

// Both squads, centred on the frame: face, name and the Bat / Bowl / All-round points (same ratings as the Home leaderboard).
const pts = (v) => (v == null ? null : v.toFixed(1));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Face({ row }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [row.photo]);
  return (
    <span className="gx-tm-face">
      {row.photo && !broken ? <img src={row.photo} alt="" draggable={false} onError={() => setBroken(true)} /> : <em>{initials(row.name)}</em>}
    </span>
  );
}

function TeamsSlot({ teams }) {
  const [held, leaving] = useLeave(teams);
  if (!held) return null;
  const most = Math.max(...held.map((t) => t.rows.length), 1);
  const rh = Math.min(3.2, 36 / most); // rows shrink a little for big squads so everything fits the frame
  return (
    <div className={`gx-teams-wrap ${leaving ? 'out' : ''}`}>
      <div className="gx-teams" style={{ '--rh': `calc(var(--u) * ${rh})` }}>
        {held.map((t, ti) => (
          <section key={ti} className="gx-tm" style={{ '--t': ti }}>
            <div className="gx-tm-shine" />
            <header className="gx-tm-head"><b>{t.name}</b><small>{t.rows.length} players</small></header>
            <div className="gx-tm-cols"><span /><span>Player</span><i>Bat</i><i>Bowl</i><i>All</i></div>
            <div className="gx-tm-rows">
              {t.rows.map((r, i) => (
                <div key={r.id} className="gx-tm-row" style={{ '--i': i }}>
                  <Face row={r} />
                  <span className="gx-tm-name">{r.name}</span>
                  <b><CountUp value={pts(r.bat)} delay={400 + i * 60} /></b>
                  <b><CountUp value={pts(r.bowl)} delay={400 + i * 60} /></b>
                  <b className="all"><CountUp value={pts(r.all)} delay={400 + i * 60} /></b>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const POP = { four: 'FOUR', six: 'SIX', wicket: 'WICKET' };

export default function Scorebug({ state, mode, popup, profile, teams }) {
  const live = mode !== 'hide';
  const lastMode = useRef(mode);
  if (live) lastMode.current = mode;
  const [mounted, setMounted] = useState(live);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (live) { setMounted(true); setLeaving(false); return undefined; }
    if (!mounted) return undefined;
    setLeaving(true); // Hide: the strip, card and pop-ups slide away, then are removed
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, 600);
    return () => clearTimeout(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted && !live) return <div className="gx-layer" />;
  const shownMode = lastMode.current;
  const tv = shownMode === 'target' ? targetView(state) : null;
  const solo = shownMode === 'summary';
  const body = shownMode === 'batters' ? <BattersBody state={state} />
    : shownMode === 'bowler' ? <BowlerBody state={state} />
    : shownMode === 'target' ? <TargetBody v={tv} />
    : shownMode === 'summary' ? <SummaryBody state={state} />
    : <LiveBody state={state} />;
  return (
    <div className="gx-layer">
      <ProfileSlot profile={live ? profile : null} />
      <TeamsSlot teams={live ? teams : null} />
      <div className={`gx-stack ${leaving ? 'leaving' : ''}`} key={shownMode}>
        {popup && live && (
          <div className={`gx-pop ${popup.kind}`} key={popup.id}>
            <b>{POP[popup.kind]}</b>{popup.sub && <small>{popup.sub}</small>}
          </div>
        )}
        <div className="gx-card">
          <div className={`gx-bar ${solo ? 'solo' : ''}`}>
            {!solo && <TeamBlock state={state} />}
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
