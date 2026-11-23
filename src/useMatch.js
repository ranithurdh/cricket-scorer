import { useEffect, useMemo, useRef, useState } from 'react';
import { computeState } from './engine';
import { saveMatch } from './api';

export const CONFIG_KEY = 'cricket-config-v1';
export const EVENTS_KEY = 'cricket-match-v1';
const load = () => {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch { return []; }
};

// One id per match, so re-saving the same match updates it in MongoDB instead of adding a duplicate.
export const CLIENT_ID_KEY = 'cricket-match-id-v1';

// The Matches page sets this when you press "Edit in scorer": the Score page then opens the match editor straight away.
export const OPEN_EDITOR_KEY = 'cricket-open-editor-v1';
export const consumeOpenEditor = () => {
  try { const on = localStorage.getItem(OPEN_EDITOR_KEY) === '1'; localStorage.removeItem(OPEN_EDITOR_KEY); return on; } catch { return false; }
};
const getClientId = () => {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLIENT_ID_KEY, id); }
    return id;
  } catch { return crypto.randomUUID(); }
};

export function useMatch(config) {
  const [events, setEvents] = useState(load);
  const [redoStack, setRedoStack] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [savedAt, setSavedAt] = useState(null);
  const clientId = useRef(getClientId());
  const everSaved = useRef(false);
  const state = useMemo(() => computeState(config, events), [config, events]);

  useEffect(() => {
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch { /* storage unavailable */ }
  }, [events]);

  // Writes the match to the database now. Resolves true if it was saved.
  const persist = () => {
    setSaveStatus('saving');
    return saveMatch({ clientId: clientId.current, config, events })
      .then(() => { everSaved.current = true; setSaveStatus('saved'); setSavedAt(new Date()); return true; })
      .catch((err) => { console.warn('Match not saved:', err.message); setSaveStatus('error'); return false; });
  };

  // Save to the database shortly after every change (after the first ball, so empty matches aren't stored).
  useEffect(() => {
    if (!everSaved.current && !events.some((e) => e.type === 'ball')) return undefined;
    setSaveStatus('saving');
    const t = setTimeout(persist, 500);
    return () => clearTimeout(t);
  }, [config, events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back online after a failed save (the match is kept in the browser meanwhile): save it now.
  useEffect(() => {
    const onOnline = () => { if (everSaved.current || events.some((e) => e.type === 'ball')) persist(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = (ev) => { setEvents([...events, ev]); setRedoStack([]); };

  // Undo = drop the last ball (and any selections made after it).
  const undo = () => {
    if (!events.length) return;
    let cut = events.length - 1;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]; // a "swap" added by the match editor (fix) travels with its ball; one you press yourself is its own step
      if (['ball', 'drop', 'end_innings', 'next_innings', 'super_over', 'no_super_over'].includes(e.type) || (e.type === 'swap' && !e.fix)) { cut = i; break; }
    }
    setRedoStack([...redoStack, events.slice(cut)]);
    setEvents(events.slice(0, cut));
  };
  const redo = () => {
    if (!redoStack.length) return;
    setEvents([...events, ...redoStack[redoStack.length - 1]]);
    setRedoStack(redoStack.slice(0, -1));
  };
  const reset = () => { setEvents([]); setRedoStack([]); };
  // The match editor hands back a whole corrected event list; it saves like any other change.
  const replaceEvents = (next) => { setEvents(next); setRedoStack([]); };

  return {
    state, events, dispatch, replaceEvents, undo, redo, reset, saveStatus, savedAt, saveNow: persist,
    canUndo: events.length > 0, canRedo: redoStack.length > 0,
    hasBalls: events.some((e) => e.type === 'ball'),
  };
}
