import { useCallback, useEffect, useState } from 'react';
import { deleteMatch, downloadBackup, fetchMatchCards, reopenMatch, setAbandoned, setMatchDate } from './api';
import { CLIENT_ID_KEY, CONFIG_KEY, EVENTS_KEY } from './useMatch';
import Avatar from './Avatar';
import { useAuth } from './auth';

const when = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
// <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm
const toLocalInput = (iso) => {
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const f1 = (v) => (v == null ? '—' : v.toFixed(1));
const f2 = (v) => (v == null ? '—' : v.toFixed(2));

function Team({ t, winner }) {
  return (
    <div className={`mt-team ${winner ? 'win' : ''}`}>
      <div className="mt-team-head">
        <b>{winner && <span className="mt-trophy" aria-label="Winner">🏆</span>}{t.name}</b>
        {t.score && <span className="mt-score">{t.score.runs}<i>/{t.score.wickets}</i> <small>({t.score.overs})</small>{t.superScores?.map((x, i) => <small key={i}> · SO {x.runs}/{x.wickets}</small>)}</span>}
      </div>
      <div className="mt-members">
        {t.players.map((p, i) => (
          <span key={`${p.name}-${i}`} className="mt-member">
            <Avatar name={p.name} photo={p.photo} size={22} />{p.name}{!p.member && <em>guest</em>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Innings({ inn, bpo }) {
  return (
    <div className="mt-inn">
      <h3>{inn.team} batting <span>{inn.runs}/{inn.wickets} ({inn.overs} ov)</span></h3>
      <div className="mt-table bat">
        <div className="mt-th"><span>Batter</span><span>Runs</span><span>Balls</span><span>4s</span><span>6s</span><span>SR</span></div>
        {inn.batting.map((b, i) => (
          <div key={`${b.name}-${i}`} className="mt-tr">
            <span className="mt-name"><b>{b.name}</b><small>{b.how}</small></span>
            <b className="mt-runs">{b.runs}</b><span>{b.balls}</span><span>{b.fours}</span><span>{b.sixes}</span><span>{f1(b.strikeRate)}</span>
          </div>
        ))}
        {inn.batting.length === 0 && <p className="mt-none">Nobody batted.</p>}
      </div>
      {inn.didNotBat.length > 0 && <p className="mt-dnb"><b>Did not bat:</b> {inn.didNotBat.join(', ')}</p>}
      <p className="mt-dnb"><b>Extras:</b> {inn.extras}</p>

      <div className="mt-table bowl">
        <div className="mt-th"><span>Bowler</span><span>Ov</span><span>Runs</span><span>Wkts</span><span>Econ</span><span>Dots</span></div>
        {inn.bowling.map((b, i) => (
          <div key={`${b.name}-${i}`} className="mt-tr">
            <span className="mt-name"><b>{b.name}</b>{b.extras > 0 && <small>{b.extras} from wides / no-balls</small>}</span>
            <span>{b.overs}</span><span>{b.runs}</span><b className={`mt-runs ${b.wickets ? 'wkt' : ''}`}>{b.wickets}</b><span>{f2(b.economy)}</span><span>{b.dots}</span>
          </div>
        ))}
        {inn.bowling.length === 0 && <p className="mt-none">Nobody bowled.</p>}
      </div>
    </div>
  );
}

export function MatchCard({ m, startOpen, actions }) {
  const [open, setOpen] = useState(startOpen);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateVal, setDateVal] = useState('');
  const winner = m.teams.find((t) => t.won);
  const ordered = winner ? [winner, ...m.teams.filter((t) => t !== winner)] : m.teams; // winner first
  return (
    <article className="match cut">
      <button className="match-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <small>{when(m.playedAt)} · {m.overs} ov</small>
        <b className="match-result">{m.status === 'completed' ? (m.result ?? 'Result unavailable') : m.abandoned ? 'Abandoned' : 'In progress'}</b>
        <span className="match-toggle">{open ? 'Hide scorecard ▲' : 'Show scorecard ▼'}</span>
      </button>
      <div className="mt-teams">
        {ordered.map((t) => <Team key={t.name} t={t} winner={!!t.won} />)}
      </div>
      {open && m.innings.map((inn, i) => <Innings key={i} inn={inn} bpo={m.ballsPerOver} />)}
      {open && m.superOvers?.map((so, n) => (
        <div key={`so${n}`}>
          <h3 className="mt-so">Super over{m.superOvers.length > 1 ? ` ${n + 1}` : ''}{so.winner ? ` · ${so.winner} won` : ' · tied'}</h3>
          {so.innings.map((inn, i) => <Innings key={i} inn={inn} bpo={m.ballsPerOver} />)}
        </div>
      ))}
      {actions && (
        <div className="match-actions">
          <button className="match-del neutral" onClick={() => actions.onEdit(m)}>Edit in scorer</button>
          <button className="match-del neutral" onClick={() => { setDateVal(toLocalInput(m.playedAt)); setDateOpen((o) => !o); }}>Set date</button>
          {m.status !== 'completed' && (
            <button className="match-del neutral" onClick={() => actions.onAbandon(m, !m.abandoned)}>{m.abandoned ? 'Restore' : 'Mark abandoned'}</button>
          )}
          <button className="match-del" onClick={() => actions.onDelete(m)}>Delete match</button>
        </div>
      )}
      {actions && dateOpen && (
        <div className="match-date">
          <input type="datetime-local" className="field-input" value={dateVal} onChange={(e) => setDateVal(e.target.value)} />
          <button className="chip-btn" disabled={!dateVal} onClick={async () => { if (await actions.onDate(m, new Date(dateVal).toISOString())) setDateOpen(false); }}>Save date</button>
          <button className="chip-btn" onClick={() => setDateOpen(false)}>Cancel</button>
        </div>
      )}
    </article>
  );
}

export default function Matches() {
  const { isAdmin } = useAuth(); // only the admin sees Delete and Backup
  const [matches, setMatches] = useState(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (p) => {
    setBusy(true); setError('');
    try {
      const r = await fetchMatchCards(p);
      setMatches((prev) => (p === 1 || !prev ? r.matches : [...prev, ...r.matches]));
      setPage(r.page); setPages(r.pages); setTotal(r.total);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { load(1); }, [load]);

  const remove = async (m) => {
    const who = m.teams.map((t) => t.name).join(' vs ');
    const live = m.status !== 'completed'
      ? '\n\nThis match is still in progress. If it is open on the Score page, scoring another ball will save it again.' : '';
    if (!window.confirm(`Delete ${who} (${when(m.playedAt)})? Its stats leave the leaderboards. Use Backup first if you might want it back.${live}`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      await deleteMatch(m.id);
      setMatches((prev) => prev.filter((x) => x.id !== m.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) { setMsg(e.message === 'match not found' ? 'That match was already deleted.' : `Could not delete: ${e.message}`); }
    setBusy(false);
  };
  const changeDate = async (m, iso) => {
    setBusy(true); setMsg('');
    try { await setMatchDate(m.id, iso); setMsg('Date updated.'); await load(1); return true; }
    catch (e) { setMsg(`Could not change the date: ${e.message}`); return false; }
    finally { setBusy(false); }
  };
  const abandon = async (m, flag) => {
    setBusy(true); setMsg('');
    try {
      await setAbandoned(m.id, flag);
      setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, abandoned: flag } : x)));
      setMsg(flag ? 'Marked abandoned. It no longer shows on the Home page.' : 'Restored.');
    } catch (e) { setMsg(`Could not update it: ${e.message}`); }
    setBusy(false);
  };
  // Open a saved match in the scorer: undo / redo and keep scoring to correct it, and every change saves to the same match.
  const edit = async (m) => {
    const who = m.teams.map((t) => t.name).join(' vs ');
    if (!window.confirm(`Open ${who} in the Score page? It replaces whatever match is open there (that one stays saved in the database). Use Undo / Redo and keep scoring to correct this match; changes save to it as you go.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await reopenMatch(m.id);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(r.config));
      localStorage.setItem(EVENTS_KEY, JSON.stringify(r.events));
      localStorage.setItem(CLIENT_ID_KEY, r.clientId);
      window.dispatchEvent(new Event('scorer:load'));
      window.location.hash = '#/score';
    } catch (e) { setMsg(`Could not open it: ${e.message}`); }
    setBusy(false);
  };
  const backup = async () => {
    setBusy(true); setMsg('');
    try { await downloadBackup(); setMsg('Backup downloaded. Keep the file somewhere safe; Settings has an Import backup card to load it back.'); }
    catch (e) { setMsg(`Backup failed: ${e.message}`); }
    setBusy(false);
  };

  return (
    <div className="lb">
      <div className="page-title">
        <div>
          <h1>Matches</h1>
          <small>{matches ? `${total} saved match${total === 1 ? '' : 'es'} · newest first` : 'Every saved match'}</small>
        </div>
        <div className="title-actions">
          {isAdmin && <button className="chip-btn" onClick={backup} disabled={busy}>Backup</button>}
          <button className="chip-btn" onClick={() => load(1)} disabled={busy}>Refresh</button>
        </div>
      </div>
      {msg && <div className="notice">{msg}</div>}

      {error && (
        <div className="notice bad">
          <b>Can't reach the server.</b> Start it with <code>npm run dev:server</code> (and MongoDB), then retry. <small>Error: {error}</small>
          <button className="chip-btn" onClick={() => load(1)}>Retry</button>
        </div>
      )}
      {!error && !matches && <div className="notice">Loading matches…</div>}
      {matches && matches.length === 0 && <div className="notice">No saved matches yet. Score a match and it shows up here.</div>}

      <div className="rows">
        {matches?.map((m, i) => <MatchCard key={m.id} m={m} startOpen={i === 0} actions={isAdmin ? { onDelete: remove, onDate: changeDate, onAbandon: abandon, onEdit: edit } : undefined} />)}
      </div>
      {matches && page < pages && (
        <button className="option cut" disabled={busy} onClick={() => load(page + 1)}>{busy ? 'Loading…' : 'Show older matches'}</button>
      )}
    </div>
  );
}
