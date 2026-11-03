import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_MEMBERS, DEFAULT_ROSTER, makeRoster } from './members';
import { fetchPlayers, createPlayer, renamePlayer, deletePlayer, uploadPlayerPhoto, removePlayerPhoto } from './api';

// The saved players live in MongoDB. The last copy is kept in localStorage so Setup still works
// (and the faces still show) when the server is slow or offline.
const CACHE_KEY = 'roster-v1';
const defaults = () => DEFAULT_MEMBERS.map((name) => ({ id: null, name, aliases: [], photo: null }));
const readCache = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(v) ? v : defaults();
  } catch { return defaults(); }
};
const writeCache = (list) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

// Used once, in App, and shared through RosterContext.
export function useRosterState() {
  const [list, setList] = useState(readCache);
  const [error, setError] = useState('');
  const roster = useMemo(() => makeRoster(list), [list]);

  const refresh = useCallback(async () => {
    try {
      const { players } = await fetchPlayers();
      writeCache(players);
      setList(players);
      setError('');
    } catch {
      setError('Could not load saved players (is the server running?)');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Each change goes to the database first, then the list is re-read so every screen agrees with it.
  // Errors (name already saved, server down…) are thrown to the caller to show next to the control.
  const change = useCallback((fn) => async (...args) => { await fn(...args); await refresh(); }, [refresh]);
  return useMemo(() => ({
    roster, list, error, refresh,
    add: change(createPlayer),
    rename: change(renamePlayer),
    remove: change(deletePlayer),
    setPhoto: change(uploadPlayerPhoto),
    removePhoto: change(removePlayerPhoto),
  }), [roster, list, error, refresh, change]);
}

export const RosterContext = createContext(null);
const FALLBACK = { roster: DEFAULT_ROSTER, list: defaults(), error: '', refresh() {} };
export const useRoster = () => useContext(RosterContext) ?? FALLBACK;
