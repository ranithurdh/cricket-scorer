import { useMemo, useState } from 'react';
import { computeState, nameOf, players, validKinds } from './engine';
import { Overlay } from './Modals';
import {
  allSections, timeline, describeBall, editBall, flipsStrike, toggleBallFlag, toggleWicketFlag,
  removeEvent, compare, scoreLines, flaggedCount, KIND_LABEL,
} from './matchEdit';

const RUNS = [0, 1, 2, 3, 4, 5, 6, 7];
const EXTRAS = [[null, 'None'], ['wide', 'Wide'], ['noball', 'No ball'], ['bye', 'Bye'], ['legbye', 'Leg bye']];

// The form for changing one ball: runs, extra, wicket, and whether it counts in player stats.
function BallForm({ config, inn, b, ev, error, onApply, onCancel }) {
  const name = (id) => nameOf(config, id);
  const [runs, setRuns] = useState(ev.runs ?? 0);
  const [extra, setExtra] = useState(ev.extra ?? null);
  const [hasW, setHasW] = useState(!!ev.wicket);
  const [kind, setKind] = useState(ev.wicket?.kind ?? null);
  const [outId, setOutId] = useState(ev.wicket?.outId ?? b.strikerId);
  const [fielderId, setFielderId] = useState(ev.wicket?.fielderId ?? null);
  const [countBall, setCountBall] = useState(!ev.statsOff);
  const [countWicket, setCountWicket] = useState(!ev.wicket?.noStats);
  const [keepStrike, setKeepStrike] = useState(true);

  const kinds = validKinds(extra);
  const effKind = hasW ? (kinds.includes(kind) ? kind : kinds.length === 1 ? kinds[0] : null) : null;
  const eitherEnd = effKind === 'runout' || effKind === 'other';
  const needsFielder = ['caught', 'stumped', 'runout'].includes(effKind);
  const ok = !hasW || (effKind && (effKind === 'runout' || !needsFielder || fielderId));
  const ends = [b.strikerId, b.nonStrikerId].filter(Boolean);
  const bowlers = players(config, inn.bowlingTeam);

  const submit = () => onApply({
    runs, extra, countBall, countWicket, keepStrike,
    wicket: hasW ? { kind: effKind, outId: eitherEnd ? outId : b.strikerId, fielderId: needsFielder ? fielderId : null } : null,
  });

  return (
    <Overlay title="Edit ball">
      <small>Over {b.over} · {name(b.bowlerId)} to {name(b.strikerId)}</small>

      <p>Runs{extra === 'wide' ? ' (run besides the wide)' : extra === 'bye' || extra === 'legbye' ? ' (byes / leg byes)' : ''}</p>
      <div className="options row">
        {RUNS.map((r) => <button key={r} className={`option cut ${runs === r ? 'on' : ''}`} onClick={() => setRuns(r)}>{r}</button>)}
      </div>

      <p>Extra</p>
      <div className="options row">
        {EXTRAS.map(([k, label]) => <button key={label} className={`option cut ${extra === k ? 'on' : ''}`} onClick={() => setExtra(k)}>{label}</button>)}
      </div>

      <p>Wicket</p>
      <div className="options row">
        <button className={`option cut ${!hasW ? 'on' : ''}`} onClick={() => setHasW(false)}>No wicket</button>
        <button className={`option cut ${hasW ? 'on' : ''}`} onClick={() => setHasW(true)}>Wicket</button>
      </div>
      {hasW && (
        <>
          <div className="options row">
            {kinds.map((k) => <button key={k} className={`option cut ${effKind === k ? 'on' : ''}`} onClick={() => { setKind(k); if (k !== 'runout' && k !== 'other') setOutId(b.strikerId); }}>{KIND_LABEL[k]}</button>)}
          </div>
          {effKind && (
            <p>Out: {eitherEnd ? '' : name(b.strikerId)}</p>
          )}
          {eitherEnd && (
            <div className="options row">
              {ends.map((id) => <button key={id} className={`option cut ${outId === id ? 'on' : ''}`} onClick={() => setOutId(id)}>{name(id)}</button>)}
            </div>
          )}
          {needsFielder && (
            <>
              <p>{effKind === 'caught' ? 'Catcher' : effKind === 'stumped' ? 'Keeper' : 'Fielder (optional)'}</p>
              <div className="options row">
                {bowlers.map((p) => <button key={p.id} className={`option cut ${fielderId === p.id ? 'on' : ''}`} onClick={() => setFielderId(p.id)}>{p.name}</button>)}
              </div>
            </>
          )}
        </>
      )}

      <p>Player stats</p>
      <div className="options row">
        <button className={`option cut ${countBall ? 'on' : ''}`} onClick={() => setCountBall(true)}>Ball counts</button>
        <button className={`option cut ${!countBall ? 'on' : ''}`} onClick={() => setCountBall(false)}>Ball not in stats</button>
      </div>
      {hasW && countBall && (
        <div className="options row">
          <button className={`option cut ${countWicket ? 'on' : ''}`} onClick={() => setCountWicket(true)}>Wicket counts</button>
          <button className={`option cut ${!countWicket ? 'on' : ''}`} onClick={() => setCountWicket(false)}>Wicket not in stats</button>
        </div>
      )}

      {flipsStrike(ev.runs, runs) && (
        <>
          <p>Odd / even runs changed</p>
          <div className="options row">
            <button className={`option cut ${keepStrike ? 'on' : ''}`} onClick={() => setKeepStrike(true)}>Keep later strike the same</button>
            <button className={`option cut ${!keepStrike ? 'on' : ''}`} onClick={() => setKeepStrike(false)}>Let strike change</button>
          </div>
        </>
      )}

      {error && <div className="notice bad">{error}</div>}
      <button className="option confirm" disabled={!ok} onClick={submit}>Apply to this ball</button>
      <button className="link-btn" onClick={onCancel}>Cancel</button>
    </Overlay>
  );
}

export default function EditMatch({ config, events, onSave, onClose }) {
  const [draft, setDraft] = useState(events);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState(null); // { b, inn } while one ball is being edited
  const [error, setError] = useState('');
  const bpo = config.ballsPerOver;
  const name = (id) => nameOf(config, id);

  const base = useMemo(() => computeState(config, events), [config, events]);
  const state = useMemo(() => computeState(config, draft), [config, draft]);
  const sections = useMemo(() => allSections(state, config), [state, config]);
  const sec = sections[Math.min(tab, sections.length - 1)];
  const overs = useMemo(() => timeline(sec.inn, bpo), [sec, bpo]);
  const dirty = history.length > 0;

  const now = scoreLines(state, config), was = scoreLines(base, config);
  const scoreChanged = now.lines.join('|') !== was.lines.join('|') || now.result !== was.result;

  const commit = (next) => { setHistory((h) => [...h, draft]); setDraft(next); };
  const undoStep = () => { setDraft(history[history.length - 1]); setHistory(history.slice(0, -1)); };
  const discard = () => { if (window.confirm('Throw away all changes made in this editor?')) { setDraft(events); setHistory([]); } };
  const close = () => { if (dirty && !window.confirm('Close without saving your changes?')) return; onClose(); };

  const applyForm = (f) => {
    const next = editBall(draft, form.b.idx, f);
    const { lost, strikeChanges } = compare(config, draft, next);
    if (lost > 0) {
      setError(`That change would make ${lost} later ball${lost === 1 ? '' : 's'} impossible. A new wicket needs a replacement batter, and turning a normal ball into a wide or no-ball (or back) moves every later over, so neither can be done here. You can still keep the ball out of the player stats instead.`);
      return;
    }
    if (strikeChanges > 0 && !window.confirm(`${strikeChanges} later ball${strikeChanges === 1 ? '' : 's'} will now be faced by a different batter. Apply anyway?`)) return;
    commit(next); setForm(null); setError('');
  };

  const desc = (b) => describeBall(b, name);

  return (
    <div className="editor">
      <div className="ed-head">
        <div>
          <h2>Edit match</h2>
          <small>{config.teams.map((t) => t.name).join(' vs ')}</small>
        </div>
        <button className="chip-btn" onClick={close}>Close</button>
      </div>

      <div className="ed-body">
        <div className="ed-banner cut">
          {now.lines.map((l) => <b key={l}>{l}</b>)}
          {now.result && <span>{now.result}</span>}
          {scoreChanged && <small>Was: {was.lines.join(' · ')}{was.result ? ` · ${was.result}` : ''}</small>}
          <small>
            Editing a ball changes the match itself. “Not in stats” keeps a ball (or just its wicket) out of player stats
            only; the score and scorecard stay as played.
          </small>
        </div>

        <div className="ed-tabs">
          {sections.map((s, i) => (
            <button key={s.key} className={`chip-btn ${s === sec ? 'on' : ''}`} onClick={() => setTab(i)}>{s.short}</button>
          ))}
        </div>

        <h3 className="ed-title">{sec.title} · {sec.inn.runs}/{sec.inn.wickets}</h3>
        {overs.length === 0 && <div className="notice">No balls in this innings yet.</div>}

        {overs.map((o) => (
          <section key={o.no} className="ed-over">
            <div className="ed-over-head">
              <b>Over {o.no}</b>
              <span>{o.bowlers.map(name).join(', ')}</span>
              <small>{o.runs} run{o.runs === 1 ? '' : 's'}{o.wickets ? ` · ${o.wickets} wkt` : ''}</small>
            </div>
            {o.items.map((it) => {
              if (it.kind === 'drop') {
                return (
                  <div key={`d${it.idx}`} className="ed-drop">
                    <span>🧤 Dropped catch · <b>{name(it.d.playerId)}</b></span>
                    <button className="chip-btn bad" onClick={() => commit(removeEvent(draft, it.idx))}>Revert</button>
                  </div>
                );
              }
              const { b } = it;
              const d = desc(b);
              return (
                <div key={`b${it.idx}`} className={`ed-ball ${b.statsOff ? 'off' : ''}`}>
                  <div className={`ed-tok ${d.cls}`}>{d.main}<small>{d.short}</small></div>
                  <div className="ed-info">
                    <span><b>{it.label}</b> {d.text}</span>
                    <small>{name(b.bowlerId)} to {name(b.strikerId)} · {b.runsAfter}/{b.wicketsAfter}</small>
                  </div>
                  <div className="ed-actions">
                    <button className="chip-btn" onClick={() => { setError(''); setForm({ b, inn: sec.inn }); }}>Edit</button>
                    <button className={`chip-btn ${b.statsOff ? 'bad' : ''}`} onClick={() => commit(toggleBallFlag(draft, it.idx))}>
                      {b.statsOff ? 'Not in stats' : 'In stats'}
                    </button>
                    {b.wicket && !b.statsOff && (
                      <button className={`chip-btn ${b.wicketOff ? 'bad' : ''}`} onClick={() => commit(toggleWicketFlag(draft, it.idx))}>
                        {b.wicketOff ? 'Wicket not counted' : 'Wicket counted'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="ed-bar">
        <small>
          {dirty ? `${history.length} change${history.length === 1 ? '' : 's'}` : 'No changes yet'}
          {flaggedCount(draft) ? ` · ${flaggedCount(draft)} kept out of stats` : ''}
        </small>
        <div>
          <button className="chip-btn" disabled={!dirty} onClick={undoStep}>Undo change</button>
          <button className="chip-btn" disabled={!dirty} onClick={discard}>Discard all</button>
          <button className="chip-btn solid" disabled={!dirty} onClick={() => onSave(draft)}>Save changes</button>
        </div>
      </div>

      {form && (
        <BallForm
          key={form.b.idx} config={config} inn={form.inn} b={form.b} ev={draft[form.b.idx]}
          error={error} onApply={applyForm} onCancel={() => { setForm(null); setError(''); }}
        />
      )}
    </div>
  );
}
