import { useState } from 'react';
import { useAuth } from './auth';

const NAMES = { scorer: 'scorer', admin: 'admin' };

// One password box. Either password works here; the server says which role it unlocks.
export function LoginForm({ onDone }) {
  const { login } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true); setErr('');
    try { const role = await login(pw); setPw(''); onDone?.(role); }
    catch (ex) { setErr(ex.message || 'Could not sign in'); }
    setBusy(false);
  };
  return (
    <div className="login-form">
      <div className="player-row">
        <input
          className="field-input" type="password" value={pw} placeholder="Password" autoComplete="current-password"
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn cut add-btn" disabled={busy || !pw} onClick={submit}>{busy ? '…' : 'Unlock'}</button>
      </div>
      {err && <small className="set-err">{err}</small>}
    </div>
  );
}

// Shows its children only to someone with the right role; otherwise a password box.
export default function RequireRole({ need, what, children }) {
  const { role, canScore, isAdmin, logout } = useAuth();
  const ok = need === 'admin' ? isAdmin : canScore;
  const [msg, setMsg] = useState('');
  if (ok) return children;

  return (
    <div className="lb">
      <div className="page-title"><h1>{need === 'admin' ? 'Admin only' : 'Scorers only'}</h1></div>
      <section className="set-card cut">
        <h2>{need === 'admin' ? 'Enter the admin password' : 'Enter the scorer password'}</h2>
        <small>
          {need === 'admin'
            ? `${what} needs the admin password.`
            : `${what} needs the scorer password (the admin password works too).`}
          {' '}Everyone can still look at Home, Leaderboards, 1v1 and Matches.
        </small>
        {role && !ok && <small className="set-err">You're signed in as {NAMES[role]}, which can't open this. Enter the admin password.</small>}
        <LoginForm onDone={(r) => setMsg(need === 'admin' && r !== 'admin' ? 'That password only allows scoring. The admin password is needed here.' : '')} />
        {msg && <small className="set-err">{msg}</small>}
        {role && <button className="chip-btn" style={{ alignSelf: 'flex-start' }} onClick={logout}>Sign out</button>}
      </section>
    </div>
  );
}
