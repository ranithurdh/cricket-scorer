import { useLayoutEffect, useRef } from 'react';
import { nameOf } from './engine';

const W = 100, H = 120;
const POS = { keeper: [50, 9], striker: [50, 26], nonStriker: [57, 64], bowler: [46, 86] };
const SLOT = { striker: POS.striker, nonStriker: POS.nonStriker }; // the two ends of the pitch
const MS_PER_RUN = 480;

const move = ([x, y]) => `translate(${x}px, ${y}px)`;

export default function Field({ config, inn }) {
  const els = useRef({ striker: null, nonStriker: null });
  const prev = useRef({ len: inn.log.length, striker: inn.strikerId, nonStriker: inn.nonStrikerId });

  // When 1, 2 or 3 runs are scored, the batters run between the two ends of the pitch.
  // Each circle starts at the end its batter was at, crosses once per run, and finishes where the scoring says they are.
  useLayoutEffect(() => {
    const before = prev.current;
    const last = inn.overBalls[inn.overBalls.length - 1];
    prev.current = { len: inn.log.length, striker: inn.strikerId, nonStriker: inn.nonStrikerId };

    const runs = last?.runs ?? 0;
    const newBall = inn.log.length === before.len + 1;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!newBall || reduced || last?.wicket || runs < 1 || runs > 3) return;

    for (const role of ['striker', 'nonStriker']) {
      const el = els.current[role], id = inn[`${role}Id`];
      if (!el || !id || typeof el.animate !== 'function') continue;
      const from = before.striker === id ? 'striker' : before.nonStriker === id ? 'nonStriker' : null;
      if (!from) continue; // a new batter just walked in: nothing to run from
      const other = (r) => (r === 'striker' ? 'nonStriker' : 'striker');
      const path = [from];
      for (let i = 0; i < runs; i++) path.push(other(path[path.length - 1]));
      if (path[path.length - 1] !== role) path.push(role); // end-of-over swap: glide to the final spot
      const frames = path.map((r) => ({ transform: move(SLOT[r]), easing: 'ease-in-out' }));
      el.getAnimations?.().forEach((a) => a.cancel());
      el.animate(frames, { duration: MS_PER_RUN * (path.length - 1), easing: 'linear' });
    }
  }, [inn.log.length, inn.strikerId, inn.nonStrikerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dot = ([x, y], label, cls) => (
    <g key={label + x}>
      <circle cx={x} cy={y} r="3" className={cls} />
      <text x={x + 5} y={y + 1.2} className="lbl">{label}</text>
    </g>
  );
  // batters sit in a <g> that is moved with a transform, so the whole circle + name can be animated
  const batter = (role, label) => (
    <g key={role} ref={(el) => { els.current[role] = el; }} style={{ transform: move(SLOT[role]) }}>
      <circle cx="0" cy="0" r="3" className="p bat" />
      <text x="5" y="1.2" className="lbl">{label}</text>
    </g>
  );
  return (
    <div className="field-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="field">
        <rect x="0" y="0" width={W} height={H} rx="3" className="grass" />
        <rect x="38" y="17" width="24" height="52" className="pitch" />
        <line x1="36" x2="64" y1="23" y2="23" className="crease" />
        <line x1="36" x2="64" y1="63" y2="63" className="crease" />
        {dot(POS.keeper, 'WK', 'p fielder')}
        {batter('striker', nameOf(config, inn.strikerId))}
        {batter('nonStriker', nameOf(config, inn.nonStrikerId))}
        {dot(POS.bowler, nameOf(config, inn.bowlerId), 'p fielder')}
      </svg>
    </div>
  );
}
