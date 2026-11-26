import { useEffect, useState } from 'react';
import { formatOvers, nameOf } from './engine';
import PlayerProfile from './Profile';
import { Panel, Fx, AlertCard } from './Gfx';
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
        <div className="gx-bat bowling">
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
    <div className="gx-body pair">
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
    <div className="gx-body bowling">
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

const POP = { four: 'FOUR', six: 'SIX', wicket: 'WICKET' };

// Keeps showing the last value for `ms` after it goes away, so the thing can play an exit animation.
// Returns [what to draw, is it on its way out].
function useLeave(value, ms) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (value) { setShown(value); setLeaving(false); return undefined; }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setShown(null); setLeaving(false); }, ms);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return [shown, leaving];
}

// mode: live | target | batters | bowler | summary | hide. Hide plays an exit animation, then clears the screen.
// profile: player card, stays up until it is set to null (then fades out). panel: teams / worm / matchup / match card pop-up.
// fx: a full-screen moment (transition, FOUR, SIX, WICKET, result...). It is independent of Hide.
export default function Scorebug({ state, mode, popup, profile, panel, fx, alert }) {
  const [shown, hiding] = useLeave(mode === 'hide' ? null : mode, 700);
  const [prof, profLeaving] = useLeave(profile, 800);
  const [pan, panLeaving] = useLeave(panel, 600);
  const [fxShown, fxLeaving] = useLeave(fx, 450);
  const [alr, alrLeaving] = useLeave(alert, 800);

  const tv = shown === 'target' ? targetView(state) : null;
  const solo = shown === 'summary';
  const body = shown === 'batters' ? <BattersBody state={state} />
    : shown === 'bowler' ? <BowlerBody state={state} />
    : shown === 'target' ? <TargetBody v={tv} />
    : shown === 'summary' ? <SummaryBody state={state} />
    : <LiveBody state={state} />;
  return (
    <div className={`gx-layer ${hiding ? 'hiding' : ''}`}>
      {fxShown && <div className={`gx-fx-wrap ${fxLeaving ? 'leaving' : ''}`} key={fxShown.id}><Fx fx={fxShown} /></div>}
      {shown && alr && <div className={`gx-alert-wrap ${alrLeaving ? 'leaving' : ''}`} key={alr.id}><AlertCard a={alr} /></div>}
      {shown && pan && <div className={`gx-panel-wrap ${pan.kind === 'motm' ? 'center' : ''} ${panLeaving ? 'leaving' : ''}`} key={pan.id}><Panel data={pan} /></div>}
      {shown && prof && <div className={`gx-prof-wrap ${profLeaving ? 'leaving' : ''}`} key={prof.id}><PlayerProfile profile={prof} /></div>}
      {shown && (
        <div className="gx-stack" key={shown}>
          {popup && (
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
      )}
    </div>
  );
}
