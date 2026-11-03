import { useState } from 'react';
import { RULES } from './config';
import { nameKey } from './members';
import { useRoster } from './roster';

const num = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || min));
const letter = (i) => 'AB'[i];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export default function Setup({ initial, onStart, onCancel }) {
  const { roster } = useRoster(); // the saved players, edited on the Settings page
  const { members: MEMBERS, canonical, isMember } = roster;
  const [teams, setTeams] = useState(
    initial.teams.map((t) => ({ name: t.name, players: t.players.map((p) => canonical(p.name)) })),
  );
  const [battingFirst, setBattingFirst] = useState(initial.battingFirst);
  const [overs, setOvers] = useState(String(initial.overs));
  const [bpo, setBpo] = useState(String(initial.ballsPerOver));
  const [lastMan, setLastMan] = useState(!!initial.lastManBats);
  const [guest, setGuest] = useState(['', '']);
  const [error, setError] = useState('');

  const taken = new Set(teams.flatMap((t) => t.players.map(nameKey)));
  const pool = MEMBERS.filter((m) => !taken.has(nameKey(m)));
  const editTeam = (i, fn) => setTeams((ts) => ts.map((t, k) => (k === i ? fn(t) : t)));

  const add = (i, raw) => {
    const name = canonical(raw);
    if (!name) return false;
    if (taken.has(nameKey(name))) { setError(`${name} is already in a team`); return false; }
    setError('');
    editTeam(i, (t) => ({ ...t, players: [...t.players, name] }));
    return true;
  };
  const addGuest = (i) => { if (add(i, guest[i])) setGuest((g) => g.map((v, k) => (k === i ? '' : v))); };
  const split = () => {
    const mixed = shuffle(MEMBERS), half = Math.ceil(mixed.length / 2);
    setTeams((ts) => ts.map((t, i) => ({ ...t, players: i === 0 ? mixed.slice(0, half) : mixed.slice(half) })));
    setError('');
  };

  const ready = teams.every((t) => t.players.length >= 2);
  const start = () => {
    const clean = teams.map((t, i) => ({
      name: t.name.trim() || `Team ${letter(i)}`,
      players: t.players.map((n, j) => ({ id: `${'ab'[i]}${j}`, name: n })),
    }));
    onStart({
      ...RULES,
      overs: num(overs, 1, 50),
      ballsPerOver: num(bpo, 1, 12),
      battingFirst,
      lastManBats: lastMan,
      teams: clean,
    });
  };

  return (
    <div className="setup">
      <div className="page-title">
        <h1>Match setup</h1>
        <button className="chip-btn" onClick={split} title="Randomly split all saved players into two teams" disabled={MEMBERS.length < 2}>Shuffle teams</button>
      </div>

      {teams.map((t, i) => (
        <section key={i} className={`card team t${i}`}>
          <input
            className="field-input title"
            value={t.name}
            placeholder={`Team ${letter(i)}`}
            onChange={(e) => editTeam(i, (x) => ({ ...x, name: e.target.value }))}
          />

          <div className="squad">
            {t.players.length === 0 && <p className="empty-note">Tap dorm members below to build the squad (min 2). Add more on the Settings page.</p>}
            {t.players.map((p, j) => (
              <span key={p} className={`pill ${isMember(p) ? 'member' : 'guest'}`}>
                {p}{!isMember(p) && <em>guest</em>}
                <button aria-label={`Remove ${p}`} onClick={() => editTeam(i, (x) => ({ ...x, players: x.players.filter((_, k) => k !== j) }))}>✕</button>
              </span>
            ))}
          </div>

          {pool.length > 0 && (
            <>
              <p className="label">Dorm members</p>
              <div className="squad">
                {pool.map((m) => <button key={m} className="pill add" onClick={() => add(i, m)}>+ {m}</button>)}
              </div>
            </>
          )}

          <div className="player-row">
            <input
              className="field-input"
              value={guest[i]}
              placeholder="Guest player name"
              onChange={(e) => setGuest((g) => g.map((v, k) => (k === i ? e.target.value : v)))}
              onKeyDown={(e) => e.key === 'Enter' && addGuest(i)}
            />
            <button className="btn cut add-btn" disabled={!guest[i].trim()} onClick={() => addGuest(i)}>Add</button>
          </div>
        </section>
      ))}
      {error && <p className="error-note">{error}</p>}

      <section className="card">
        <p className="label">Batting first</p>
        <div className="options row">
          {teams.map((t, i) => (
            <button key={i} className={`option cut ${battingFirst === i ? 'on' : ''}`} onClick={() => setBattingFirst(i)}>
              {t.name.trim() || `Team ${letter(i)}`}
            </button>
          ))}
        </div>
        <div className="two">
          <label>Overs
            <input className="field-input" inputMode="numeric" value={overs} onChange={(e) => setOvers(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label>Balls per over
            <input className="field-input" inputMode="numeric" value={bpo} onChange={(e) => setBpo(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={lastMan} onChange={(e) => setLastMan(e.target.checked)} />
          Last batter bats alone
        </label>
      </section>

      <p className="foot-note">Only dorm members' stats count towards the leaderboards. Guests can play but aren't tracked.</p>

      <div className="setup-actions">
        <button className="option cut confirm" disabled={!ready} onClick={start}>Start match</button>
        {!ready && <small>Each team needs at least 2 players.</small>}
        {onCancel && <button className="link-btn" onClick={onCancel}>Back to current match</button>}
      </div>
    </div>
  );
}
