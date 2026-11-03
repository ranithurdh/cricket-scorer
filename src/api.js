// Talks to the Express server (Vite proxies /api to it in dev).
import { getToken } from './authStore';

const authHeader = () => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

async function request(url, options) {
  const res = await fetch(url, { ...options, headers: { ...options?.headers, ...authHeader() } });
  // a token the server no longer accepts: sign out (a wrong password at the login box is not this)
  if (res.status === 401 && getToken() && !url.startsWith('/api/auth/login')) window.dispatchEvent(new Event('auth:expired'));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed (${res.status})`);
  }
  return res.json();
}

export const saveMatch = ({ clientId, config, events }) =>
  request('/api/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, config, events }),
  });

// Career stats for the 8 dorm members, from completed matches.
export const fetchPlayerStats = () => request('/api/stats/players');

// Site look (background image + tab icon), stored in MongoDB. Values are image URLs or null.
export const fetchSettings = () => request('/api/settings');
export const uploadSettingImage = (name, blob) =>
  request(`/api/settings/${name}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
export const removeSettingImage = (name) => request(`/api/settings/${name}`, { method: 'DELETE' });
export const saveBackgroundOpacity = (value) =>
  request('/api/settings/opacity', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });

// Saved players (the dorm roster) and their faces, stored in MongoDB.
export const fetchPlayers = () => request('/api/players');
export const createPlayer = (name) =>
  request('/api/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
export const renamePlayer = (id, name) =>
  request(`/api/players/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
export const deletePlayer = (id) => request(`/api/players/${id}`, { method: 'DELETE' });
export const uploadPlayerPhoto = (id, blob) =>
  request(`/api/players/${id}/photo`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
export const removePlayerPhoto = (id) => request(`/api/players/${id}/photo`, { method: 'DELETE' });

// Scorecards for the Matches page (newest first, paged).
export const fetchMatchCards = (page = 1, limit = 20, { hideAbandoned = false } = {}) =>
  request(`/api/matches/cards?page=${page}&limit=${limit}${hideAbandoned ? '&hideAbandoned=1' : ''}`);

// Home page records (highest score, best spell, first fifty, first hat-trick, most-won team).
export const fetchHighlights = () => request('/api/stats/highlights');

// 1v1 page: maidens, stumpings, best figures and every batter-vs-bowler matchup for one player.
export const fetchVersus = (name) => request(`/api/stats/versus?player=${encodeURIComponent(name)}`);

// Delete one saved match from the database.
export const deleteMatch = (id) => request(`/api/matches/${id}`, { method: 'DELETE' });

// Backup: everything as one JSON file (download), and read one back in (adds only, never overwrites).
export async function downloadBackup() {
  const res = await fetch('/api/backup', { headers: authHeader() });
  if (!res.ok) throw new Error(`backup failed (${res.status})`);
  const text = await res.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cricket-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const importBackup = (backup) =>
  request('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });

// Sign in: the password decides the role ('scorer' or 'admin') and we get a token back.
export const login = (password) =>
  request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });

// Admin: when a match was played, abandon / restore an unfinished match, and fetch a match to correct in the scorer.
export const setMatchDate = (id, playedAt) =>
  request(`/api/matches/${id}/date`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playedAt }) });
export const setAbandoned = (id, abandoned) =>
  request(`/api/matches/${id}/abandon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abandoned }) });
export const reopenMatch = (id) => request(`/api/matches/${id}/reopen`, { method: 'POST' });
