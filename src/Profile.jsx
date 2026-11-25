import { useEffect, useRef, useState } from 'react';

// The player card that slides in when a new batter or bowler is picked. Pure display: it is given everything it shows.
// profile = { id, kind: 'bat' | 'bowl', name, team, saved (is on the roster), photo (url or null), stats (career numbers or null) }

const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v).toFixed(d));

function rowsFor(profile) {
  const s = profile.stats;
  if (!s) return [];
  if (profile.kind === 'bowl') {
    const b = s.bowling ?? {};
    return [
      ['Matches', num(b.matches)], ['Wickets', num(b.wickets)], ['Overs', num(b.overs, 1)],
      ['Economy', num(b.economy, 2)], ['Average', num(b.average, 2)], ['Dot %', num(b.dotPct, 1)],
    ];
  }
  const b = s.batting ?? {};
  return [
    ['Matches', num(s.matches)], ['Runs', num(b.runs)], ['Average', num(b.average, 2)],
    ['SR', num(b.strikeRate, 2)], ['4s / 6s', b.innings ? `${b.fours}/${b.sixes}` : null], ['High score', num(b.highScore)],
  ];
}

// Counts up from 0 to the value (numbers only; "27/39" and "-" are shown as they are).
export function CountUp({ value, delay }) {
  const text = value ?? '-';
  const target = Number(text);
  const numeric = value !== null && value !== undefined && Number.isFinite(target) && /^-?\d+(\.\d+)?$/.test(text);
  const [shown, setShown] = useState(numeric ? 0 : target);
  const frame = useRef(0);
  useEffect(() => {
    if (!numeric) return undefined;
    const decimals = (text.split('.')[1] ?? '').length;
    const start = performance.now() + delay;
    const dur = 900;
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      setShown(target * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(target);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [text, delay]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!numeric) return <>{text}</>;
  const decimals = (text.split('.')[1] ?? '').length;
  return <>{shown.toFixed(decimals)}</>;
}

export default function PlayerProfile({ profile }) {
  const rows = rowsFor(profile);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [profile.photo]);
  const showPhoto = !!profile.photo && !broken; // no saved face, no picture
  const isBowl = profile.kind === 'bowl';
  return (
    <div className={`gx-prof ${isBowl ? 'bowl' : 'bat'} ${showPhoto ? 'has-photo' : ''}`} key={profile.id}>
      <div className="gx-prof-shine" />
      <header className="gx-prof-head">
        <b>{isBowl ? 'Bowler profile' : 'Batter profile'}</b>
        <small>{profile.team}</small>
      </header>
      <div className="gx-prof-body">
        {rows.length > 0 ? (
          <div className="gx-prof-rows">
            {rows.map(([label, value], i) => (
              <div key={label} className="gx-prof-row" style={{ '--i': i }}>
                <span>{label}</span>
                <b><CountUp value={value} delay={500 + i * 90} /></b>
              </div>
            ))}
          </div>
        ) : (
          <div className="gx-prof-none">{profile.saved ? 'No career stats yet' : 'Guest player'}</div>
        )}
        {showPhoto && (
          <div className="gx-prof-photo">
            <img src={profile.photo} alt="" draggable={false} onError={() => setBroken(true)} />
          </div>
        )}
      </div>
      <footer className="gx-prof-name">
        <em>{isBowl ? 'Bowling' : 'Batting'}</em>
        <b>{profile.name}</b>
      </footer>
    </div>
  );
}
