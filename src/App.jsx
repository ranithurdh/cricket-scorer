import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG } from './config';
import Setup from './Setup';
import Leaderboards from './Leaderboards';
import Settings from './Settings';
import Matches from './Matches';
import Home from './Home';
import Versus from './Versus';
import RequireRole from './LoginGate';
import { AuthContext, useAuthState } from './auth';
import { HomeIcon, VersusIcon, ScoreIcon, LeaderboardIcon, MatchesIcon, SettingsIcon } from './Icons';
import { useSiteSettings } from './siteSettings';
import { RosterContext, useRosterState } from './roster';
import { useMatch, EVENTS_KEY, CLIENT_ID_KEY, CONFIG_KEY } from './useMatch';
import { players, nameOf, formatOvers } from './engine';
import Field from './Field';
import { Overlay, Picker, DismissalModal } from './Modals';

const LABEL = { bye: 'Bye', legbye: 'Leg bye', wide: 'WD', noball: 'NB' };
const SHORT = { bye: 'Bye', legbye: 'Lb', wide: 'Wd', noball: 'Nb' };
const TITLE = { striker: 'Select striker', nonStriker: 'Select non-striker', bowler: 'Select bowler' };

function token(b) {
  const total = b.batRuns + b.extraRuns;
  const sub = SHORT[b.extra] ?? '';
  if (b.wicket) return { main: 'W', sub: total ? `${sub} +${total}`.trim() : sub, cls: 'wicket' };
  const cls = b.batRuns >= 4 ? 'boundary' : b.extra ? 'extra' : total === 0 ? 'dot' : 'run';
  return { main: total === 0 ? '•' : String(total), sub, cls };
}

function Match({ config, onNew }) {
  const { state, dispatch, undo, redo, canUndo, canRedo, hasBalls, saveStatus, savedAt, saveNow } = useMatch(config);
  const [mods, setMods] = useState({ extra: null, out: false });
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const inn = state.current;
  const bpo = config.ballsPerOver;
  const name = (id) => nameOf(config, id);
  const sure = (msg) => window.confirm(msg);

  const commit = (ball) => {
    dispatch(ball);
    setMods({ extra: null, out: false });
    setModal(null);
  };
  const onRun = (runs) => {
    const ball = { type: 'ball', runs, extra: mods.extra };
    if (mods.out) setModal({ type: 'out', ball });
    else commit(ball);
  };

  const batterOpts = () =>
    players(config, inn.battingTeam)
      .filter((p) => ['yet', 'retired'].includes(inn.batters[p.id].status))
      .map((p) => {
        const b = inn.batters[p.id];
        return { value: p.id, label: p.name, sub: b.status === 'retired' ? `retired ${b.runs}(${b.balls})` : '' };
      });
  const bowlerOpts = (excludeId) => {
    const all = players(config, inn.bowlingTeam).map((p) => {
      const b = inn.bowlers[p.id];
      return { value: p.id, label: p.name, sub: b ? `${b.wickets}-${b.runs} (${formatOvers(b.balls, bpo)})` : '' };
    });
    const rest = all.filter((o) => o.value !== excludeId);
    return rest.length ? rest : all;
  };
  const fielderOpts = () =>
    players(config, inn.bowlingTeam).map((p) => {
      const drops = inn.fielding[p.id]?.drops ?? 0;
      return { value: p.id, label: p.name, sub: drops ? `${drops} dropped` : '' };
    });
  const select = (role) => (playerId) => { dispatch({ type: 'select', role, playerId }); setModal(null); };
  const atCrease = () => [inn.strikerId, inn.nonStrikerId].filter(Boolean).map((id) => ({ value: id, label: name(id) }));
  const roleOf = (id) => (id === inn.strikerId ? 'striker' : 'nonStriker');

  let overlay = null;
  if (state.matchOver) {
    overlay = (
      <Overlay title="Match over">
        <p className="big">{state.result}</p>
        {state.innings.map((i, k) => (
          <p key={k}>{config.teams[i.battingTeam].name}: {i.runs}/{i.wickets} ({formatOvers(i.legalBalls, bpo)})</p>
        ))}
        {state.superOvers.map((so, n) => (
          <p key={`so${n}`}>
            <b>Super over{state.superOvers.length > 1 ? ` ${n + 1}` : ''}:</b>{' '}
            {so.innings.map((i) => `${config.teams[i.battingTeam].name} ${i.runs}/${i.wickets}`).join(' · ')}
          </p>
        ))}
        <small>
          {saveStatus === 'saved' ? 'Saved to the leaderboards ✓' : saveStatus === 'error' ? 'Not saved — is the server running?' : 'Saving…'}
        </small>
        {state.offerSuper && (
          <>
            <p className="big">{state.superOvers.length ? 'Super over tied too.' : 'It\'s a tie.'} Play {state.superOvers.length ? 'another' : 'a'} super over?</p>
            <small>One over each, same teams and rules. It is saved as part of this match; super over runs and wickets don't count in player stats.</small>
            <button className="option cut confirm" onClick={() => dispatch({ type: 'super_over' })}>Play super over</button>
            <button className="option cut" onClick={() => dispatch({ type: 'no_super_over' })}>No, keep it tied</button>
          </>
        )}
        {!state.offerSuper && <button className="option cut confirm" onClick={onNew}>New match</button>}
        <button className="link-btn" onClick={undo}>Undo last ball</button>
      </Overlay>
    );
  } else if (inn.closed) {
    overlay = (
      <Overlay title={state.inSuper ? 'Super over: innings complete' : 'Innings complete'}>
        <p className="big">{config.teams[inn.battingTeam].name}: {inn.runs}/{inn.wickets}</p>
        <p>Target: {inn.runs + 1}</p>
        <button className="option cut confirm" onClick={() => dispatch({ type: 'next_innings' })}>Start {state.inSuper ? 'super over reply' : '2nd innings'}</button>
        <button className="link-btn" onClick={undo}>Undo last ball</button>
      </Overlay>
    );
  } else if (state.needs) {
    const role = state.needs;
    overlay = (
      <Picker
        title={TITLE[role]}
        options={role === 'bowler' ? bowlerOpts(config.allowConsecutiveOvers ? null : inn.prevBowlerId) : batterOpts()}
        onPick={select(role)}
        onCancel={hasBalls ? undo : null}
        cancelLabel="Undo last ball"
      />
    );
  } else if (modal?.type === 'more') {
    overlay = (
      <Overlay title="More options">
        <div className="options">
          <button className="option cut" onClick={() => setModal({ type: 'bowler' })}>Change bowler</button>
          <button className="option cut" onClick={() => setModal({ type: 'pickEnd', retire: false })}>Change batter</button>
          <button className="option cut" onClick={() => setModal({ type: 'pickEnd', retire: true })}>Retire batter</button>
          <button className="option cut" onClick={() => { setModal(null); if (sure('Finish innings now?')) dispatch({ type: 'end_innings' }); }}>Finish innings</button>
        </div>
        <button className="link-btn" onClick={() => setModal(null)}>Close</button>
      </Overlay>
    );
  } else if (modal?.type === 'out') {
    overlay = (
      <DismissalModal
        config={config} inn={inn} extra={modal.ball.extra}
        onConfirm={(w) => commit({ ...modal.ball, wicket: w })}
        onCancel={() => setModal(null)}
      />
    );
  } else if (modal?.type === 'drop') {
    overlay = (
      <Picker
        title="Who dropped the catch?"
        options={fielderOpts()}
        onPick={(id) => { dispatch({ type: 'drop', playerId: id }); setModal(null); setFlash(`Dropped catch logged: ${name(id)}`); }}
        onCancel={() => setModal(null)}
      />
    );
  } else if (modal?.type === 'bowler') {
    overlay = <Picker title="Change bowler" options={bowlerOpts(inn.bowlerId)} onPick={select('bowler')} onCancel={() => setModal(null)} />;
  } else if (modal?.type === 'pickEnd') {
    overlay = (
      <Picker
        title={modal.retire ? 'Who retires?' : 'Replace which batter?'}
        options={atCrease()}
        onPick={(id) => {
          if (modal.retire) { dispatch({ type: 'retire', playerId: id }); setModal(null); }
          else setModal({ type: 'newBatter', role: roleOf(id) });
        }}
        onCancel={() => setModal(null)}
      />
    );
  } else if (modal?.type === 'newBatter') {
    overlay = <Picker title="Replace with" options={batterOpts()} onPick={select(modal.role)} onCancel={() => setModal(null)} />;
  }

  const batter = (id, star) => {
    const b = inn.batters[id];
    return b
      ? <div className={`batter ${star ? 'on-strike' : ''}`}><span>{star && <em className="ptr">▶</em>}{name(id)}</span><b>{b.runs}<small>({b.balls})</small></b></div>
      : <div className="batter">—</div>;
  };
  const bw = inn.bowlers[inn.bowlerId];
  const tokens = inn.overBalls.map(token);
  const legalLeft = Math.max(0, bpo - inn.overBalls.filter((b) => b.legal).length); // wides / no-balls add a box but don't use one up
  for (let i = 0; i < legalLeft; i++) tokens.push({ main: '-', sub: '', cls: 'empty' });

  const toggle = (k) => setMods((m) => ({ ...m, extra: m.extra === k ? null : k }));
  const hint = [mods.extra && LABEL[mods.extra], mods.out && 'Out'].filter(Boolean).join(' + ');

  return (
    <div className="app">
      <header className="header cut">
        <div className="score">
          <span className="tag">{config.teams[inn.battingTeam].name}</span>
          <b>{inn.runs}<i>/{inn.wickets}</i></b>
          <small>{formatOvers(inn.legalBalls, bpo)} / {state.oversLimit} ov{state.inSuper ? ' · SUPER OVER' : ''}</small>
        </div>
        <div className="batters">{batter(inn.strikerId, true)}{batter(inn.nonStrikerId, false)}</div>
        <div className="bowler">
          <div className="batter bowl"><span><em className="ptr">●</em>{name(inn.bowlerId) || '—'}</span><b>{bw ? `${bw.wickets}-${bw.runs}` : ''}<small>{bw ? `(${formatOvers(bw.balls, bpo)})` : ''}</small></b></div>
          <div className="strip">
            {tokens.map((t, i) => <div key={i} className={`tok cut ${t.cls}`}>{t.main}<small>{t.sub}</small></div>)}
          </div>
        </div>
      </header>

      <main className="main">
        <aside className="col">
          <button className="btn cut side" onClick={() => setModal({ type: 'more' })}>⋯<small>More options</small></button>

          <button
            className="btn cut side"
            disabled={inn.closed || inn.alone || !inn.strikerId || !inn.nonStrikerId}
            title="Swap striker and non-striker"
            onClick={() => dispatch({ type: 'swap' })}
          >⇄<small>Swap batters</small></button>
          <button
            className="btn cut side" disabled={!hasBalls || saveStatus === 'saving'}
            title={hasBalls ? 'Save this match to the database now' : 'Score a ball first'}
            onClick={async () => setFlash((await saveNow()) ? 'Saved to the database ✓' : 'Not saved: is the server running and are you signed in?')}
          >💾<small>Save now</small></button>
          <button className="link-btn" onClick={onNew}>New match</button>
          {saveStatus !== 'idle' && (
            <small className={`save ${saveStatus}`}>
              {{ saving: 'Saving…', saved: `Saved ✓${savedAt ? ` ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`, error: 'Not saved (server down?)' }[saveStatus]}
            </small>
          )}
        </aside>

        <Field config={config} inn={inn} />

        <aside className="col">
          <button className="btn cut side" disabled={!canUndo} onClick={undo}>↶<small>Undo</small></button>
          <button className="btn cut side" disabled={!canRedo} onClick={redo}>↷<small>Redo</small></button>
          <button className="btn cut side drop" disabled={inn.closed} onClick={() => setModal({ type: 'drop' })}>🧤<small>Dropped catch</small></button>
          {state.target && <div className="need cut"><small>Need</small><b>{state.need}</b><small>off {state.ballsLeft}</small></div>}
        </aside>
      </main>

      <footer className="pad">
        <div className="runs">
          {[0, 1, 2, 3, 4, 6].map((r) => (
            <button key={r} className={`btn cut run r${r}`} onClick={() => onRun(r)}>{r === 0 ? '•' : r}</button>
          ))}
        </div>
        <div className="mods">
          {['bye', 'legbye', 'wide', 'noball'].map((k) => (
            <button key={k} aria-pressed={mods.extra === k} className={`btn cut mod ${mods.extra === k ? 'on' : ''}`} onClick={() => toggle(k)}>{LABEL[k]}</button>
          ))}
          <button aria-pressed={mods.out} className={`btn cut mod out ${mods.out ? 'on' : ''}`} onClick={() => setMods((m) => ({ ...m, out: !m.out }))}>Out</button>
        </div>
        <div className={`hint ${flash ? 'flash' : ''}`}>
          {flash || (hint ? `${hint} selected — press runs scored` : 'Tap runs, or select Bye / Leg bye / WD / NB / Out first')}
        </div>
      </footer>
      {overlay}
    </div>
  );
}

const loadConfig = () => {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; }
};

const pageFromHash = () => {
  const h = window.location.hash;
  return h.startsWith('#/score') ? 'score' : h.startsWith('#/leaderboards') ? 'leaderboards' : h.startsWith('#/versus') ? 'versus' : h.startsWith('#/matches') ? 'matches' : h.startsWith('#/settings') ? 'settings' : 'home'; // home is the default page
};
const HASH = { home: '#/', score: '#/score', leaderboards: '#/leaderboards', versus: '#/versus', matches: '#/matches', settings: '#/settings' };

export default function App() {
  const [config, setConfig] = useState(loadConfig);
  const [editing, setEditing] = useState(!config);
  const [matchId, setMatchId] = useState(0);
  const [page, setPage] = useState(pageFromHash);
  const site = useSiteSettings();
  const rosterApi = useRosterState(); // saved players + faces, shared by Setup, Leaderboards and Settings
  const authApi = useAuthState();     // who is signed in: nobody (view only), scorer, or admin

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // The Matches page can hand a match to the scorer (admin: correct a finished match); pick it up from storage.
  useEffect(() => {
    const reload = () => { setConfig(loadConfig()); setEditing(false); setMatchId((m) => m + 1); };
    window.addEventListener('scorer:load', reload);
    return () => window.removeEventListener('scorer:load', reload);
  }, []);
  const go = (p) => { window.location.hash = HASH[p]; };

  const score = editing ? (
    <Setup
      initial={config ?? DEFAULT_CONFIG}
      onCancel={config ? () => setEditing(false) : null}
      onStart={(c) => {
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
          localStorage.removeItem(EVENTS_KEY);
          localStorage.removeItem(CLIENT_ID_KEY); // next match gets its own database record
        } catch { /* storage unavailable */ }
        setConfig(c);
        setMatchId((m) => m + 1);
        setEditing(false);
      }}
    />
  ) : (
    <Match key={matchId} config={config} onNew={() => setEditing(true)} />
  );

  return (
    <AuthContext.Provider value={authApi}>
    <RosterContext.Provider value={rosterApi}>
    <div className="shell">
      <nav className="topbar">
        <div className="brand"><span className="brand-full">SB <b>CRICKET</b></span><span className="brand-short"><b>SB</b></span></div>
        <div className="tabs">
          {[
            ['home', 'Home', <HomeIcon />],
            ['score', 'Score', <ScoreIcon />],
            ['leaderboards', 'Leaderboards', <LeaderboardIcon />],
            ['versus', '1v1', <VersusIcon />],
            ['matches', 'Matches', <MatchesIcon />],
            ['settings', 'Settings', <SettingsIcon />],
          ].map(([key, label, icon]) => (
            <button
              key={key} className={`tab cut icon ${page === key ? 'on' : ''}`} onClick={() => go(key)}
              aria-label={label} title={label} aria-current={page === key ? 'page' : undefined}
            >{icon}</button>
          ))}
        </div>
      </nav>
      {/* The scorer stays mounted (just hidden) so switching tabs never loses a match in progress. */}
      {/* Scoring needs the scorer (or admin) password; an unfinished match is kept in this browser and comes back after signing in. */}
      <div className="page score-page" style={{ display: page === 'score' ? undefined : 'none' }}>
        {authApi.canScore ? score : <div className="scroll" style={{ overflow: 'auto', height: '100%' }}><RequireRole need="scorer" what="Scoring" /></div>}
      </div>
      {page === 'home' && <div className="page scroll"><Home /></div>}
      {page === 'versus' && <div className="page scroll"><Versus /></div>}
      {page === 'leaderboards' && <div className="page scroll"><Leaderboards /></div>}
      {page === 'matches' && <div className="page scroll"><Matches /></div>}
      {page === 'settings' && <div className="page scroll"><RequireRole need="admin" what="Settings"><Settings {...site} /></RequireRole></div>}
    </div>
    </RosterContext.Provider>
    </AuthContext.Provider>
  );
}
