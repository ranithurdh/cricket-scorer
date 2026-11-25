import { useEffect, useMemo, useState } from 'react';
import { computeState } from './engine';

// The stream graphic keeps its own match in the browser only. It never touches the database or the
// stats, and uses its own storage keys so it can't disturb a real match being scored on the Score page.
export const GFX_CONFIG_KEY = 'gfx-config-v1';
export const GFX_EVENTS_KEY = 'gfx-events-v1';
const load = () => {
  try { return JSON.parse(localStorage.getItem(GFX_EVENTS_KEY)) || []; } catch { return []; }
};

export function useGraphicMatch(config) {
  const [events, setEvents] = useState(load);
  const [redoStack, setRedoStack] = useState([]);
  const state = useMemo(() => computeState(config, events), [config, events]);

  useEffect(() => {
    try { localStorage.setItem(GFX_EVENTS_KEY, JSON.stringify(events)); } catch { /* storage unavailable */ }
  }, [events]);

  const dispatch = (ev) => { setEvents([...events, ev]); setRedoStack([]); };

  // Undo = drop the last ball (and any selections made after it), same as the Score page.
  const undo = () => {
    if (!events.length) return;
    let cut = events.length - 1;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
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
  const replaceEvents = (next) => { setEvents(next); setRedoStack([]); };

  return {
    state, events, dispatch, replaceEvents, undo, redo,
    canUndo: events.length > 0, canRedo: redoStack.length > 0,
    hasBalls: events.some((e) => e.type === 'ball'),
  };
}
