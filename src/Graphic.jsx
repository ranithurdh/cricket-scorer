import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG } from './config';
import Setup from './Setup';
import EditMatch from './EditMatch';
import Scorebug from './Scorebug';
import { Overlay, Picker, DismissalModal } from './Modals';
import { RosterContext, useRosterState, useRoster } from './roster';
import { fetchPlayerStats, fetchVersus } from './api';
import { players, nameOf, formatOvers } from './engine';
import { nameKey } from './members';
import { h2h, lastWicket, matchCard, matchupToday, milestoneAlert, motmCard, playerToday, resultView, strikerLine, todayLine, wormView } from './graphicStats';
import { useGraphicMatch, GFX_CONFIG_KEY, GFX_EVENTS_KEY } from './useGraphicMatch';
import './graphic.css';

// The hidden stream-graphic page. Same scoring as the Score page, but nothing is saved to the database
// or counted in any stats. The top half is a green screen with the live graphic on it; the buttons are below.

const LABEL = { bye: 'Bye', legbye: 'Leg bye', wide: 'WD', noball: 'NB' };
const TITLE = { striker: 'Select striker', nonStriker: 'Select non-striker', bowler: 'Select bowler' };
const MODES = [['live', 'Live'], ['target', 'Target'], ['batters', 'Batters'], ['bowler', 'Bowler'], ['summary', 'Summary'], ['hide', 'Hide']];
const KEYS = { green: ['Green', '#00b140'], blue: ['Blue', '#0047bb'], magenta: ['Magenta', '#ff00ff'] };
const POP_MS = 2650;
// How long each full-screen graphic plays before it is taken off (a little longer than its animation).
const FX_MS = { transition: 2160, four: 2960, six: 3520, wicket: 3200, fifty: 3520, hundred: 4160, freehit: 2720, hattrick: 3040, result: 5600 };
const FX_BUTTONS = [
  ['transition', 'Transition', ''], ['four', '4 runs', 'f4'], ['six', '6 runs', 'f6'], ['wicket', 'Wicket', 'fw'],
  ['fifty', 'Fifty', ''], ['hundred', 'Hundred', ''], ['freehit', 'Free hit', ''], ['hattrick', 'Hat-trick', ''], ['result', 'Result', 'fr'],
];
const ALERT_MS = 9000; // how long a milestone alert stays up
const PROFILE_BUTTONS = [['striker', 'Striker'], ['non', 'Non-striker'], ['bowler', 'Bowler']];
const PANEL_BUTTONS = [['teams', 'Teams'], ['worm', 'Worm'], ['matchup', 'Matchup'], ['card', 'Match card']];

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
  const [profile, setProfile] = useState(null);
  const [panel, setPanel] = useState(null);       // { kind: 'teams' | 'worm' | 'matchup' | 'card', id }
  const [fx, setFx] = useState(null);             // full-screen graphic being played
  const [versus, setVersus] = useState(null);     // 1v1 history of the batter in the matchup pop-up
  const [matchBat, setMatchBat] = useState('striker'); // which batter the matchup pop-up follows
  const { roster } = useRoster();
  const statsCache = useRef(null);
  const profileSeq = useRef(0);
  const [overSeen, setOverSeen] = useState(false); // match-over sheet put away
  const [alert, setAlert] = useState(null);     // milestone alert card (top left)
  const alertTimer = useRef(0);
  const fxTimer = useRef(0);
  const cardTimer = useRef(0);

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

  // Player card: pops up when the Striker / Non-striker / Bowler button is pressed (and fades when pressed again).
  // It only READS the saved players' career stats and faces from the database; nothing is written.
  const roleId = (role) => (role === 'striker' ? inn.strikerId : role === 'non' ? inn.nonStrikerId : (inn.bowlerId ?? inn.prevBowlerId));
  const showProfile = async (role) => {
    const playerId = roleId(role);
    const id = ++profileSeq.current;
    if (!playerId) { setFlash(`No ${role === 'non' ? 'non-striker' : role} selected yet`); return; }
    const kind = role === 'bowler' ? 'bowl' : 'bat';
    const teamIdx = kind === 'bowl' ? inn.bowlingTeam : inn.battingTeam;
    const pname = name(playerId);
    const entry = roster.find(pname);
    let list = statsCache.current;
    try {
      list = await Promise.race([fetchPlayerStats(), new Promise((_, no) => setTimeout(no, 1500))]);
      statsCache.current = list;
    } catch { /* offline: use the last copy, or show the card without numbers */ }
    if (id !== profileSeq.current) return; // something newer happened while the stats were loading
    const stats = entry ? (list ?? []).find((p) => nameKey(p.name) === entry.key) ?? null : null;
    setProfile({ id: Date.now(), role, kind, name: pname, team: config.teams[teamIdx].name, saved: !!entry, photo: stats?.photo ?? entry?.photo ?? null, stats });
  };
  const toggleProfile = (role) => {
    if (profile?.role === role) { profileSeq.current += 1; setProfile(null); return; }
    showProfile(role);
  };

  // ----- pop-up panels (teams, worm, matchup, match card) -----
  const togglePanel = (kind) => {
    if (panel?.kind === kind) { setPanel(null); return; }
    setPanel({ kind, id: Date.now() });
  };

  const matchBatId = matchBat === 'non' ? inn.nonStrikerId : inn.strikerId;
  const matchBowlId = inn.bowlerId ?? inn.prevBowlerId;
  const matchBatName = matchBatId ? name(matchBatId) : '';
  // The batter's saved 1v1 history is read when the matchup pop-up is open (read only).
  useEffect(() => {
    if (panel?.kind !== 'matchup' || !matchBatName) return undefined;
    const e = roster.find(matchBatName);
    if (!e) return undefined;
    let dead = false;
    fetchVersus(e.name)
      .then((r) => { if (!dead) setVersus({ key: e.key, ok: true, rows: r.batting ?? [] }); })
      .catch(() => { if (!dead) setVersus({ key: e.key, ok: false, rows: [] }); });
    return () => { dead = true; };
  }, [panel?.kind, matchBatName]); // eslint-disable-line react-hooks/exhaustive-deps

  let panelData = null;
  if (panel) {
    if (panel.kind === 'teams') {
      const pts = new Map(playerToday(state).map((r) => [r.id, r.points]));
      panelData = {
        kind: 'teams', id: panel.id, best: Math.max(0, ...pts.values()),
        teams: config.teams.map((t, k) => ({
          name: t.name, batting: inn.battingTeam === k,
          players: t.players.map((p, i) => {
            const e = roster.find(p.name);
            return { id: p.id, i, name: p.name, saved: !!e, photo: e?.photo ?? null, points: pts.get(p.id) ?? 0 };
          }),
        })),
      };
    } else if (panel.kind === 'worm') {
      panelData = { ...wormView(state), kind: 'worm', id: panel.id };
    } else if (panel.kind === 'matchup') {
      const bt = matchBatId ? roster.find(matchBatName) : null;
      const bwName = matchBowlId ? name(matchBowlId) : '';
      const bw = matchBowlId ? roster.find(bwName) : null;
      let status = 'ready', career = null;
      if (!matchBatId || !matchBowlId) status = 'wait';
      else if (!bt || !bw) status = 'guest';
      else if (!versus || versus.key !== bt.key) status = 'loading';
      else if (!versus.ok) status = 'offline';
      else {
        const row = versus.rows.find((r) => nameKey(r.opponent) === bw.key);
        career = row ? h2h(row, bpo) : null;
      }
      panelData = {
        kind: 'matchup', id: panel.id, status, career,
        today: matchBatId && matchBowlId ? matchupToday(inn, matchBatId, matchBowlId, bpo) : null,
        batter: { name: matchBatName || '—', photo: bt?.photo ?? null },
        bowler: { name: bwName || '—', photo: bw?.photo ?? null },
      };
    } else if (panel.kind === 'motm') {
      const m = motmCard(state, panel.playerId);
      const e = m ? roster.find(m.name) : null;
      panelData = m ? { ...m, kind: 'motm', id: panel.id, photo: e?.photo ?? null } : null;
    } else {
      panelData = { ...matchCard(state), kind: 'card', id: panel.id };
    }
  }

  // ----- Man of the match: pick anyone from the match (the best performer is suggested first) -----
  const motmOpts = () => playerToday(state).map((r, i) => ({ value: r.id, label: `${i === 0 ? '★ ' : ''}${r.name}`, sub: `${r.team} · ${todayLine(r)}${i === 0 ? ' · suggested' : ''}` }));
  const toggleMotm = () => { if (panel?.kind === 'motm') setPanel(null); else setModal({ type: 'motm' }); };
  const pickMotm = (playerId) => { setModal(null); setPanel({ kind: 'motm', id: Date.now(), playerId }); };

  // ----- Milestone alert: striker, non-striker or bowler, measured against their saved career stats -----
  const milestoneOpts = () => [['striker', inn.strikerId, 'Striker'], ['non', inn.nonStrikerId, 'Non-striker'], ['bowler', inn.bowlerId ?? inn.prevBowlerId, 'Bowler']]
    .filter(([, id]) => id).map(([value, id, label]) => ({ value, label: `${label}: ${name(id)}` }));
  const toggleMilestone = () => {
    if (alert) { clearTimeout(alertTimer.current); setAlert(null); } else setModal({ type: 'milestone' });
  };
  const pickMilestone = async (who) => {
    setModal(null);
    const id = who === 'striker' ? inn.strikerId : who === 'non' ? inn.nonStrikerId : (inn.bowlerId ?? inn.prevBowlerId);
    const pname = name(id);
    const e = roster.find(pname);
    if (!e) { setFlash(`${pname} is a guest: no career stats`); return; }
    let list = statsCache.current;
    try { list = await fetchPlayerStats(); statsCache.current = list; } catch { /* offline: use the last copy */ }
    const row = list?.find((x) => nameKey(x.name) === e.key);
    const a = row ? milestoneAlert(state, id, row, who === 'bowler' ? 'bowl' : 'bat') : null;
    if (!a) { setFlash(`No career stats for ${pname}`); return; }
    clearTimeout(alertTimer.current);
    setAlert({ ...a, id: Date.now(), photo: e.photo ?? row.photo ?? null });
    alertTimer.current = setTimeout(() => setAlert(null), ALERT_MS);
  };

  // ----- full-screen graphics (transition, FOUR, SIX, WICKET, milestones, result) -----
  const playFx = (kind) => {
    const base = { id: Date.now(), kind };
    const on = (id) => { const b = inn.batters[id]; return b ? `${name(id)} ${b.runs}(${b.balls})` : name(id); };
    if (kind === 'transition') Object.assign(base, { a: config.teams[0].name, b: config.teams[1].name });
    else if (kind === 'four' || kind === 'six') {
      const last = inn.log[inn.log.length - 1];
      const id = last && last.batRuns === (kind === 'four' ? 4 : 6) ? last.strikerId : (inn.strikerId ?? inn.nonStrikerId);
      base.sub = id ? on(id) : '';
    } else if (kind === 'wicket') {
      const w = lastWicket(state);
      if (w) Object.assign(base, { how: w.how, sub: `${w.name} ${w.runs}(${w.balls})${w.bowler ? ` · b ${w.bowler}` : ''}` });
    } else if (kind === 'fifty' || kind === 'hundred') {
      const s = strikerLine(state);
      if (s) Object.assign(base, { name: s.name, sub: s.runs >= (kind === 'fifty' ? 50 : 100) ? `${s.runs} off ${s.balls} balls` : '' });
    } else if (kind === 'freehit') base.sub = 'Next ball: only a run out';
    else if (kind === 'hattrick') base.sub = name(inn.bowlerId ?? inn.prevBowlerId);
    else if (kind === 'result') {
      const r = resultView(state);
      if (!r) { setFlash('The result graphic is for when the match is over'); return; }
      base.result = r;
    }
    clearTimeout(fxTimer.current);
    setFx(base);
    fxTimer.current = setTimeout(() => setFx(null), FX_MS[kind]);
  };
  const clearFx = () => { clearTimeout(fxTimer.current); setFx(null); };

  // End of the match: the result animation plays, then the match summary pop-up opens.
  const done = state.matchOver && !state.offerSuper;
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && popsOn) {
      playFx('result');
      clearTimeout(cardTimer.current);
      cardTimer.current = setTimeout(() => setPanel({ kind: 'card', id: Date.now() }), FX_MS.result - 720);
    }
    if (!done) clearTimeout(cardTimer.current);
    wasDone.current = done;
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!state.matchOver) setOverSeen(false); }, [state.matchOver]);
  useEffect(() => () => { clearTimeout(fxTimer.current); clearTimeout(cardTimer.current); clearTimeout(alertTimer.current); }, []);

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

  // The match-over sheet covers the controls; "Show graphics" puts it away so the result, summary and Man of the match buttons can be used.
  const showOver = state.matchOver && !(overSeen && !state.offerSuper);
  let overlay = null;
  if (showOver) {
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
        {!state.offerSuper && <button className="option cut confirm" onClick={() => setOverSeen(true)}>Show graphics</button>}
        {!state.offerSuper && <button className="option cut" onClick={onNew}>New match</button>}
        <button className="link-btn" onClick={undo}>Undo last ball</button>
      </Overlay>
    );
  } else if (inn.closed && !state.matchOver) {
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
  } else if (modal?.type === 'motm') {
    overlay = <Picker title="Man of the match" options={motmOpts()} onPick={pickMotm} onCancel={() => setModal(null)} />;
  } else if (modal?.type === 'milestone') {
    overlay = <Picker title="Milestone alert for" options={milestoneOpts()} onPick={pickMilestone} onCancel={() => setModal(null)} />;
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
          <Scorebug state={state} mode={mode} popup={popup} profile={profile} panel={panelData} fx={fx} alert={alert} />
        </div>
      </div>

      <section className="gfx-controls">
        <div className="gfx-inner">
          <div className="gfx-modes" role="group" aria-label="Graphic mode">
            {MODES.map(([k, label]) => (
              <button key={k} aria-pressed={mode === k} className={`btn cut gfx-mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>

          <div className="gfx-util">
            <button className="btn cut side" onClick={() => setModal({ type: 'more' })}>⋯<small>More options</small></button>
            <button
              className="btn cut side"
              disabled={inn.closed || inn.alone || !inn.strikerId || !inn.nonStrikerId}
              onClick={() => dispatch({ type: 'swap' })}
            >⇄<small>Swap batters</small></button>
            <button className="btn cut side" disabled={!events.length} onClick={() => setEditor(true)}>✎<small>Edit match</small></button>
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

          <div className="gfx-group">
            <div className="gfx-gl">On screen</div>
            <div className="gfx-btns">
              {PANEL_BUTTONS.map(([k, label]) => (
                <button key={k} aria-pressed={panel?.kind === k} className={`btn cut gfx-b ${panel?.kind === k ? 'on' : ''}`} onClick={() => togglePanel(k)}>{label}</button>
              ))}
              <button className={`btn cut gfx-b wide ${panel?.kind === 'motm' ? 'on' : ''}`} aria-pressed={panel?.kind === 'motm'} onClick={toggleMotm}>Man of the match</button>
              <button className={`btn cut gfx-b wide ${alert ? 'on' : ''}`} aria-pressed={!!alert} onClick={toggleMilestone}>Milestone alert</button>
              {PROFILE_BUTTONS.map(([k, label]) => (
                <button key={k} aria-pressed={profile?.role === k} className={`btn cut gfx-b ${profile?.role === k ? 'on' : ''}`} onClick={() => toggleProfile(k)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="gfx-group">
            <div className="gfx-gl">Graphics</div>
            <div className="gfx-btns">
              {FX_BUTTONS.map(([k, label, cls]) => (
                <button key={k} className={`btn cut gfx-b ${cls} ${fx?.kind === k ? 'on' : ''}`} disabled={k === 'result' && !state.matchOver} onClick={() => playFx(k)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="gfx-foot">
            <button className="chip-btn" onClick={nextKey}>Key colour: {KEYS[keyColour][0]}</button>
            <button className="chip-btn" disabled={!fx} onClick={clearFx}>Clear graphic</button>
            <button className="chip-btn" onClick={() => setMatchBat((b) => (b === 'striker' ? 'non' : 'striker'))}>Matchup: {matchBat === 'striker' ? 'Striker' : 'Non-striker'}</button>
            <button className="chip-btn" aria-pressed={popsOn} onClick={() => setPopsOn((v) => !v)}>Pop-ups: {popsOn ? 'On' : 'Off'}</button>
            <button className="chip-btn" aria-pressed={guide} onClick={() => setGuide((v) => !v)}>Frame guide: {guide ? 'On' : 'Off'}</button>
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
