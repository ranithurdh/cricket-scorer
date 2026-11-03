import { useState } from 'react';
import { validKinds, players, nameOf } from './engine';

export function Overlay({ title, children }) {
  return (
    <div className="overlay">
      <div className="sheet">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Picker({ title, options, onPick, onCancel, cancelLabel = 'Cancel' }) {
  return (
    <Overlay title={title}>
      {options.length === 0 && <p>No players available.</p>}
      <div className="options">
        {options.map((o) => (
          <button key={o.value} className="option cut" onClick={() => onPick(o.value)}>
            <span>{o.label}</span>
            {o.sub && <small>{o.sub}</small>}
          </button>
        ))}
      </div>
      {onCancel && <button className="link-btn" onClick={onCancel}>{cancelLabel}</button>}
    </Overlay>
  );
}

const KINDS = { bowled: 'Bowled', caught: 'Caught', stumped: 'Stumped', other: 'Other', runout: 'Run out' };

export function DismissalModal({ config, inn, extra, onConfirm, onCancel }) {
  const kinds = validKinds(extra);
  const [kind, setKind] = useState(kinds.length === 1 ? kinds[0] : null);
  const [outId, setOutId] = useState(inn.strikerId);
  const [fielderId, setFielderId] = useState(null);

  const eitherEnd = kind === 'runout' || kind === 'other';
  const needsFielder = ['caught', 'stumped', 'runout'].includes(kind);
  const ok = kind && (kind === 'runout' || !needsFielder || fielderId);
  const name = (id) => nameOf(config, id);
  const choose = (k) => { setKind(k); if (k !== 'runout' && k !== 'other') setOutId(inn.strikerId); };

  return (
    <Overlay title="Wicket">
      <div className="options row">
        {kinds.map((k) => (
          <button key={k} className={`option cut ${kind === k ? 'on' : ''}`} onClick={() => choose(k)}>{KINDS[k]}</button>
        ))}
      </div>
      {kind && (
        <>
          <p>Out: {eitherEnd ? '' : name(inn.strikerId)}</p>
          {eitherEnd && (
            <div className="options row">
              {[inn.strikerId, inn.nonStrikerId].map((id) => (
                <button key={id} className={`option cut ${outId === id ? 'on' : ''}`} onClick={() => setOutId(id)}>{name(id)}</button>
              ))}
            </div>
          )}
          {!needsFielder && <p>Bowler: {name(inn.bowlerId)}</p>}
          {needsFielder && (
            <>
              <p>{kind === 'caught' ? 'Catcher' : kind === 'stumped' ? 'Keeper' : 'Fielder (optional)'}</p>
              <div className="options row">
                {players(config, inn.bowlingTeam).map((p) => (
                  <button key={p.id} className={`option cut ${fielderId === p.id ? 'on' : ''}`} onClick={() => setFielderId(p.id)}>{p.name}</button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <button className="option confirm" disabled={!ok} onClick={() => onConfirm({ kind, outId, fielderId })}>Confirm wicket</button>
      <button className="link-btn" onClick={onCancel}>Cancel</button>
    </Overlay>
  );
}
