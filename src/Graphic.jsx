import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONFIG } from './config';
import Setup from './Setup';
import EditMatch from './EditMatch';
import Scorebug from './Scorebug';
import { Overlay, Picker, DismissalModal } from './Modals';
import { RosterContext, useRosterState, useRoster } from './roster';
import { fetchPlayerStats } from './api';
import { players, nameOf, formatOvers } from './engine';
import { nameKey } from './members';
import { overallRatings } from './ratings';
import { useGraphicMatch, GFX_CONFIG_KEY, GFX_EVENTS_KEY } from './useGraphicMatch';
import './graphic.css';

// The hidden stream-graphic page. Same scoring as the Score page, but nothing is saved to the database
// or counted in any stats. The top half is a green screen with the live graphic on it; the buttons are below.

const LABEL = { bye: 'Bye', legbye: 'Leg bye', wide: 'WD', noball: 'NB' };
const TITLE = { striker: 'Select striker', nonStriker: 'Select non-striker', bowler: 'Select bowler' };
const MODES = [['live', 'Live'], ['target', 'Target'], ['batters', 'Batters'], ['bowler', 'Bowler'], ['summary', 'Summary'], ['hide', 'Hide']];
const KEYS = { green: ['Green', '#00b140'], blue: ['Blue', '#0047bb'], magenta: ['Magenta', '#ff00ff'] };
const POP_MS = 3300;

// A setting kept in this browser (so a refresh doesn't switch the mode back or change the key colour).
function usePersisted(key, initial, valid) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      const v = raw === null ? initial : JSON.parse(raw);
      return valid && !valid(v) ? initial : v;
    } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }, [key, value]);
  return [value, setValue];
}

function Scoring({ config, onNew }) {
  const { state, events, dispatch, replaceEvents, undo, redo, canUndo, canRedo, hasBalls } = useGraphicMatch(config);
  const [mode, setMode] = usePersisted('gfx-mode-v1', 'live', (v) => MODES.some(([k]) => k === v));
  const [keyColour, setKeyColour] = usePersisted('gfx-key-v1', 'green', (v) => v in KEYS);
  const [popsOn, setPopsOn] = usePersisted('gfx-pops-v1', true);
  const [guide, setGuide] = usePersisted('gfx-guide-v1', false);
  const [mods, setMods] = useState({ extra: null, out: false });
  const [modal, setModal] = useState(null);
  const [editor, setEditor] = useState(false);
  const [flash, setFlash] = useState('');
  const [popup, setPopup] = useState(null);
  const [cards, setCards] = useState({ striker: null, nonStriker: null, bowler: null });
  const [openProfileId, setOpenProfileId] = useState(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [statsList, setStatsList] = useState(null);
  const { roster } = useRoster();
  const statsCache = useRef(null);
  const statsPromise = useRef(null);

  const inn = state.current;
  const bpo = config.ballsPerOver;
  const name = (id) => nameOf(config, id);
  const sure = (msg) => window.confirm(msg);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  // Four / six / wicket banner: appears when a ball is scored (not on undo, not when the innings changes).
  const prevLen = useRef(inn.log.length);
  useEffect(() => {
    const len = inn.log.length, last = inn.log[len - 1];
    if (len === prevLen.current + 1 && last && popsOn) {
      const kind = last.wicket ? 'wicket' : last.batRuns === 6 ? 'six' : last.batRuns === 4 ? 'four' : null;
      if (kind) {
        let sub = name(last.strikerId);
        if (last.wicket) { const b = inn.batters[last.wicket.outId]; sub = b ? `${name(last.wicket.outId)} ${b.runs}(${b.balls})` : name(last.wicket.outId); }
        setPopup({ kind, sub, id: Date.now() });
      }
    } else if (len < prevLen.current) setPopup(null);
    prevLen.current = len;
  }, [inn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!popup) return undefined;
    const t = setTimeout(() => setPopup(null), POP_MS);
    return () => clearTimeout(t);
  }, [popup]);

  // Keep the three profile controls tied to the players currently occupying each live position.
  // The graphic only reads saved player stats/photos; no match, database or stats records are changed.
  const loadStats = () => {
    if (statsCache.current) return Promise.resolve(statsCache.current);
    if (!statsPromise.current) {
      statsPromise.current = Promise.race([
        fetchPlayerStats(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Player stats timed out')), 1500)),
      ]).then((list) => {
        statsCache.current = list;
        return list;
      }).catch(() => null).finally(() => { statsPromise.current = null; });
    }
    return statsPromise.current;
  };

  useEffect(() => {
    let cancelled = false;
    const makeCard = (playerId, kind, teamIdx, list) => {
      if (!playerId) return null;
      const pname = name(playerId);
      const entry = roster.find(pname);
      const stats = entry ? (list ?? []).find((p) => nameKey(p.name) === entry.key) ?? null : null;
      return {
        id: `${kind}-${playerId}-${teamIdx}`,
        playerId,
        kind,
        name: pname,
        team: config.teams[teamIdx].name,
        saved: !!entry,
        photo: stats?.photo ?? entry?.photo ?? null,
        stats,
      };
    };
    const makeCards = (list) => ({
      striker: makeCard(inn.strikerId, 'bat', inn.battingTeam, list),
      nonStriker: makeCard(inn.nonStrikerId, 'bat', inn.battingTeam, list),
      bowler: makeCard(inn.bowlerId, 'bowl', inn.bowlingTeam, list),
    });

    // Show the current players immediately; career stats/photos fill in when available.
    setCards(makeCards(statsCache.current));
    if ([inn.strikerId, inn.nonStrikerId, inn.bowlerId].some(Boolean) && !statsCache.current) {
      loadStats().then((list) => {
        if (!cancelled && list) setCards(makeCards(list));
      });
    }
    return () => { cancelled = true; };
  }, [inn.strikerId, inn.nonStrikerId, inn.bowlerId, inn.battingTeam, inn.bowlingTeam, config, roster]); // eslint-disable-line react-hooks/exhaustive-deps

  // A profile follows its player when the batters swap ends, and closes if that player leaves the crease/attack.
  useEffect(() => {
    const activeIds = [inn.strikerId, inn.nonStrikerId, inn.bowlerId].filter(Boolean);
    setOpenProfileId((current) => current && activeIds.includes(current) ? current : null);
  }, [inn.strikerId, inn.nonStrikerId, inn.bowlerId]);

  const isOpen = (slot) => !!cards[slot]?.playerId && openProfileId === cards[slot].playerId;
  const toggleCard = (slot) => {
    const playerId = cards[slot]?.playerId;
    if (!playerId) return;
    setOpenProfileId((current) => current === playerId ? null : playerId);
  };
  const profile = Object.values(cards).find((card) => card?.playerId === openProfileId) ?? null;

  // Teams card: both squads with faces and Bat / Bowl / All-round points. Only reads the saved players' stats.
  const toggleTeams = async () => {
    if (teamsOpen) { setTeamsOpen(false); return; }
    setTeamsOpen(true);
    if (statsCache.current) setStatsList(statsCache.current);
    try {
      const list = await Promise.race([fetchPlayerStats(), new Promise((_, no) => setTimeout(no, 4000))]);
      statsCache.current = list;
      setStatsList(list);
    } catch { /* offline: faces and names still show, points stay blank */ }
  };
  const teamsView = useMemo(() => {
    const list = statsList ?? [];
    const bat = overallRatings(list, 'batting', (p) => p.batting.innings > 0).map;
    const bowl = overallRatings(list, 'bowling', (p) => p.bowling.balls > 0).map;
    return config.teams.map((t) => ({
      name: t.name,
      rows: t.players.map((p) => {
        const entry = roster.find(p.name);
        const st = entry ? list.find((x) => nameKey(x.name) === entry.key) ?? null : null;
        const b = st ? bat.get(st.name)?.score ?? null : null, w = st ? bowl.get(st.name)?.score ?? null : null;
        return { id: p.id, name: p.name, photo: st?.photo ?? entry?.photo ?? null, bat: b, bowl: w, all: b != null && w != null ? (b + w) / 2 : null };
      }),
    }));
  }, [config, roster, statsList]);

  const commit = (ball) => { dispatch(ball); setMods({ extra: null, out: false }); setModal(null); };
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
        {state.offerSuper && (
          <>
            <p className="big">{state.superOvers.length ? 'Super over tied too.' : 'It\'s a tie.'} Play {state.superOvers.length ? 'another' : 'a'} super over?</p>
            <small>One over each, same teams and rules.</small>
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

  const toggle = (k) => setMods((m) => ({ ...m, extra: m.extra === k ? null : k }));
  const hint = [mods.extra && LABEL[mods.extra], mods.out && 'Out'].filter(Boolean).join(' + ');
  const nextKey = () => setKeyColour((k) => { const ks = Object.keys(KEYS); return ks[(ks.indexOf(k) + 1) % ks.length]; });

  return (
    <div className="gfx-page">
      <div className="gfx-band" style={{ '--key': KEYS[keyColour][1] }}>
        <div className={`gfx-stage ${guide ? 'guide' : ''}`}>
          <Scorebug state={state} mode={mode} popup={popup} profile={profile} teams={teamsOpen ? teamsView : null} />
        </div>
      </div>

      <section className="gfx-controls">
        <div className="gfx-inner">
          <div className="gfx-modes" role="group" aria-label="Graphic mode">
            {MODES.map(([k, label]) => (
              <button key={k} aria-pressed={mode === k} className={`btn cut gfx-mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>

          <div className="gfx-profs" role="group" aria-label="Teams and player profiles">
            <button className={`btn cut gfx-prof-btn ${teamsOpen ? 'on' : ''}`} aria-pressed={teamsOpen} onClick={toggleTeams} title={teamsOpen ? 'Hide the teams' : 'Show both teams with their points'}>
              <span>Teams</span><small>Squads &amp; points</small>
            </button>
            {[
              ['striker', 'Striker'],
              ['nonStriker', 'Non-striker'],
              ['bowler', 'Bowler'],
            ].map(([slot, label]) => (
              <button
                key={slot}
                className={`btn cut gfx-prof-btn ${isOpen(slot) ? 'on' : ''}`}
                aria-pressed={isOpen(slot)}
                disabled={!cards[slot]?.playerId}
                onClick={() => toggleCard(slot)}
                title={isOpen(slot) ? 'Hide the profile' : 'Show the profile on the graphic'}
              >
                <span>{label}</span><small>{cards[slot]?.name ?? 'No player selected'}</small>
              </button>
            ))}
          </div>

          <div className="gfx-util">
            <button className="btn cut side" onClick={() => setModal({ type: 'more' })}>⋯<small>More options</small></button>
            <button
              className="btn cut side"
              disabled={inn.closed || inn.alone || !inn.strikerId || !inn.nonStrikerId}
              title="Swap striker and non-striker"
              onClick={() => dispatch({ type: 'swap' })}
            >⇄<small>Swap batters</small></button>
            <button className="btn cut side" disabled={!events.length} title="Edit every ball" onClick={() => setEditor(true)}>✎<small>Edit match</small></button>
            <button className="btn cut side" disabled={!canUndo} onClick={undo}>↶<small>Undo</small></button>
            <button className="btn cut side" disabled={!canRedo} onClick={redo}>↷<small>Redo</small></button>
            <button className="btn cut side drop" disabled={inn.closed} onClick={() => setModal({ type: 'drop' })}>🧤<small>Dropped catch</small></button>
          </div>

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

          <div className="gfx-foot">
            <button className="chip-btn" onClick={nextKey} title="Change the screen colour to key out">Key colour: {KEYS[keyColour][0]}</button>
            <button className="chip-btn" aria-pressed={popsOn} onClick={() => setPopsOn((v) => !v)} title="Show FOUR / SIX / WICKET banners">Pop-ups: {popsOn ? 'On' : 'Off'}</button>
            <button className="chip-btn" aria-pressed={guide} onClick={() => setGuide((v) => !v)} title="Dashed outline of the 16:9 frame">Frame guide: {guide ? 'On' : 'Off'}</button>
            <button className="chip-btn" onClick={onNew}>New match</button>
          </div>
        </div>
        {overlay}
      </section>

      {editor && (
        <div className="gfx-editor">
          <EditMatch
            config={config} events={events}
            onClose={() => setEditor(false)}
            onSave={(next) => { replaceEvents(next); setEditor(false); setFlash('Changes applied'); }}
          />
        </div>
      )}
    </div>
  );
}

const loadConfig = () => {
  try { return JSON.parse(localStorage.getItem(GFX_CONFIG_KEY)); } catch { return null; }
};

function GraphicPage() {
  const [config, setConfig] = useState(loadConfig);
  const [editing, setEditing] = useState(!config);
  const [matchId, setMatchId] = useState(0);

  if (editing) {
    return (
      <div className="gfx-setup">
        <Setup
          standalone
          initial={config ?? DEFAULT_CONFIG}
          onCancel={config ? () => setEditing(false) : null}
          onStart={(c) => {
            try {
              localStorage.setItem(GFX_CONFIG_KEY, JSON.stringify(c));
              localStorage.removeItem(GFX_EVENTS_KEY);
            } catch { /* storage unavailable */ }
            setConfig(c);
            setMatchId((m) => m + 1);
            setEditing(false);
          }}
        />
      </div>
    );
  }
  return <Scoring key={matchId} config={config} onNew={() => setEditing(true)} />;
}

export default function GraphicApp() {
  const rosterApi = useRosterState(); // read-only use of the saved players, to pick teams quickly
  useEffect(() => {
    const title = document.title;
    document.title = 'Scorebug';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => { document.title = title; meta.remove(); };
  }, []);
  return (
    <RosterContext.Provider value={rosterApi}>
      <GraphicPage />
    </RosterContext.Provider>
  );
}
