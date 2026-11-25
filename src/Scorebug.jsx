import { formatOvers, nameOf } from './engine';
import { ballToken, bowlerLine, fixed, liveNote, partnership, plural, strikeRate, summaryView, targetView } from './graphicStats';

// Everything drawn on the green screen. Sizes are in --u (1% of a 16:9 frame), so it scales with the stage.

function TeamBlock({ state }) {
  const { config, current: inn } = state;
  return (
    <div className="gx-team">
      <span className="gx-tag">{config.teams[inn.battingTeam].name}</span>
      <b className="gx-score">{inn.runs}<i>/{inn.wickets}</i></b>
      <span className="gx-ov">{formatOvers(inn.legalBalls, config.ballsPerOver)}<em> / {state.oversLimit} ov</em></span>
      {state.inSuper && <span className="gx-so">Super over</span>}
    </div>
  );
}

function OverBalls({ inn, bpo }) {
  const tokens = inn.overBalls.map(ballToken);
  const left = Math.max(0, bpo - inn.overBalls.filter((b) => b.legal).length); // wides and no-balls add a box but don't use one up
  for (let i = 0; i < left; i++) tokens.push({ main: '', sub: '', cls: 'empty' });
  return (
    <div className="gx-balls">
      {tokens.map((t, i) => <div key={i} className={`gx-tok ${t.cls}`}>{t.main}{t.sub && <small>{t.sub}</small>}</div>)}
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
  const row = (id, star) => {
    const b = inn.batters[id];
    if (!b) return null;
    return (
      <div key={id} className={`gx-row ${star ? 'on' : 'dim'}`}>
        <span className="gx-name">{star && <em className="ptr">▶</em>}{nameOf(config, id)}</span>
        <b>{b.runs}</b><span>{b.balls}</span><span>{b.fours}</span><span>{b.sixes}</span><span>{fixed(strikeRate(b.runs, b.balls))}</span>
      </div>
    );
  };
  return (
    <div className="gx-body table">
      <div className="gx-row head"><span>Batter</span><span>R</span><span>B</span><span>4s</span><span>6s</span><span>SR</span></div>
      {row(inn.strikerId, true)}
      {row(inn.nonStrikerId, false)}
      <div className="gx-foot"><span>Partnership</span><b>{p.runs}</b><small>({p.balls})</small></div>
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

function TargetBody({ v }) {
  if (v.kind === 'result') return <div className="gx-body result"><b className="gx-result">{v.text}</b></div>;
  if (v.kind === 'projected') {
    return (
      <div className="gx-body target">
        <div className="gx-need">
          <div><span>Projected score</span></div>
          <div><b>{v.projected ?? '-'}</b><span>at this rate</span></div>
        </div>
      </div>
    );
  }
  const set = v.kind === 'set';
  return (
    <div className="gx-body target">
      <div className="gx-need">
        <div><span>Need</span><b>{v.need}</b><span>{plural(v.need, 'run')}</span></div>
        <div><span>from</span><b>{v.left}</b><span>{plural(v.left, 'ball')}</span></div>
        {set && <small className="gx-for">{v.team} to chase</small>}
      </div>
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
        <Tile label="Wickets in hand" value={v.inHand} />
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
      <Tile label="Required rate" value={fixed(v.rrr, 2)} cls="hot" />
      <Tile label="Run rate" value={fixed(v.crr, 2)} />
      <Tile label="Wickets in hand" value={v.inHand} />
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

export default function Scorebug({ state, mode, popup }) {
  if (mode === 'hide') return <div className="gx-layer" />;
  const note = mode === 'live' ? liveNote(state) : null;
  const tv = mode === 'target' ? targetView(state) : null;
  const solo = mode === 'summary';
  const body = mode === 'batters' ? <BattersBody state={state} />
    : mode === 'bowler' ? <BowlerBody state={state} />
    : mode === 'target' ? <TargetBody v={tv} />
    : mode === 'summary' ? <SummaryBody state={state} />
    : <LiveBody state={state} />;
  return (
    <div className="gx-layer">
      <div className="gx-stack" key={mode}>
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
          {tv && tv.kind !== 'result' && <TargetStats v={tv} />}
          {note && <div className="gx-note"><span>{note.left}</span>{note.right && <span>{note.right}</span>}</div>}
        </div>
      </div>
    </div>
  );
}
