import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHighlights, fetchMatchCards, fetchPlayerStats } from './api';
import { overallRatings } from './ratings';
import { MatchCard } from './Matches';
import Avatar from './Avatar';
import { useAuth } from './auth';
import { LoginForm } from './LoginGate';

const hasBat = (p) => p.batting.innings > 0;
const hasBowl = (p) => p.bowling.balls > 0;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Highest rating first; ties go to whoever has played more, then by name (same order as the Leaderboards "best" cards).
const top = (players, score) => players
  .filter((p) => score(p) != null)
  .sort((a, b) => score(b) - score(a) || b.matches - a.matches || a.name.localeCompare(b.name))[0] ?? null;

function bestOf(players) {
  const bat = overallRatings(players, 'batting', hasBat).map;
  const bowl = overallRatings(players, 'bowling', hasBowl).map;
  const batScore = (p) => bat.get(p.name)?.score ?? null;
  const bowlScore = (p) => bowl.get(p.name)?.score ?? null;
  // all-rounder: needs a rating in both disciplines; the score is the average of the two
  const both = (p) => (batScore(p) != null && bowlScore(p) != null ? (batScore(p) + bowlScore(p)) / 2 : null);
  const batter = top(players, batScore), bowler = top(players, bowlScore), allRounder = top(players, both);
  return {
    batter: batter && { p: batter, value: batScore(batter).toFixed(1), sub: 'Batting rating' },
    bowler: bowler && { p: bowler, value: bowlScore(bowler).toFixed(1), sub: 'Bowling rating' },
    allRounder: allRounder && {
      p: allRounder, value: both(allRounder).toFixed(1),
      sub: `Bat ${batScore(allRounder).toFixed(0)} · Bowl ${bowlScore(allRounder).toFixed(0)}`,
    },
  };
}

function BestCard({ label, accent, data }) {
  return (
    <div className="best-card cut" style={{ '--accent': accent }}>
      <small>{label}</small>
      {data ? (
        <>
          <Avatar name={data.p.name} photo={data.p.photo} size={40} />
          <b>{data.p.name}</b>
          <span>{data.value}</span>
          <small className="home-sub">{data.sub}</small>
        </>
      ) : <em className="home-none">Not enough matches yet</em>}
    </div>
  );
}

function Record({ icon, title, accent, who, value, detail, empty }) {
  return (
    <article className="rec cut" style={{ '--accent': accent }}>
      <div className="rec-title"><span aria-hidden="true">{icon}</span><small>{title}</small></div>
      {who ? (
        <div className="rec-body">
          {who.name && <Avatar name={who.name} photo={who.photo} size={42} />}
          <div className="rec-who">
            <b>{who.name ?? value}</b>
            {detail && <small>{detail}</small>}
          </div>
          {who.name && value && <span className="rec-value">{value}</span>}
        </div>
      ) : <p className="home-none">{empty}</p>}
    </article>
  );
}

// A record that can belong to several people (or be tied): one row each.
function PeopleRecord({ icon, title, accent, items, empty }) {
  return (
    <article className="rec cut" style={{ '--accent': accent }}>
      <div className="rec-title"><span aria-hidden="true">{icon}</span><small>{title}</small></div>
      {items.length ? (
        <ul className="rec-people">
          {items.map((p) => (
            <li key={p.name} className="rec-body">
              <Avatar name={p.name} photo={p.photo} size={38} />
              <div className="rec-who"><b>{p.name}</b>{p.detail && <small>{p.detail}</small>}</div>
              <span className="rec-value">{p.value}</span>
            </li>
          ))}
        </ul>
      ) : <p className="home-none">{empty}</p>}
    </article>
  );
}

// Bottom of the Home page: who you are signed in as, or a way to sign in.
function AccountBar() {
  const { role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <section className="account-bar">
      {role ? (
        <>
          <small>Signed in as <b>{role}</b>{role === 'admin' ? ' · scoring, Settings, delete and backup unlocked' : ' · scoring unlocked'}</small>
          <button className="chip-btn" onClick={logout}>Sign out</button>
        </>
      ) : open ? (
        <LoginForm onDone={() => setOpen(false)} />
      ) : (
        <>
          <small>Viewing only. Scorers and admins sign in to unlock more.</small>
          <button className="chip-btn" onClick={() => setOpen(true)}>Sign in</button>
        </>
      )}
    </section>
  );
}

export default function Home() {
  const [players, setPlayers] = useState(null);
  const [records, setRecords] = useState(null);
  const [latest, setLatest] = useState(undefined); // undefined = loading, null = no matches yet
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    Promise.all([fetchPlayerStats(), fetchHighlights(), fetchMatchCards(1, 1, { hideAbandoned: true })])
      .then(([pl, hl, cards]) => { setPlayers(pl); setRecords(hl); setLatest(cards.matches[0] ?? null); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const best = useMemo(() => (players ? bestOf(players) : null), [players]);
  const r = records;

  return (
    <div className="lb">
      <div className="page-title">
        <div>
          <h1>Home</h1>
          <small>{r ? `${r.matches} completed match${r.matches === 1 ? '' : 'es'} · saved players only` : 'The dorm at a glance'}</small>
        </div>
        <button className="chip-btn" onClick={load}>Refresh</button>
      </div>

      {error && (
        <div className="notice bad">
          <b>Can't reach the server.</b> Start it with <code>npm run dev:server</code> (and MongoDB), then retry.
          <button className="chip-btn" onClick={load}>Retry</button>
        </div>
      )}
      {!error && !records && <div className="notice">Loading…</div>}

      {best && (
        <div className="best-strip">
          <BestCard label="Best batter" accent="var(--hunter)" data={best.batter} />
          <BestCard label="Best bowler" accent="var(--sage)" data={best.bowler} />
          <BestCard label="Best all-rounder" accent="var(--lime)" data={best.allRounder} />
        </div>
      )}

      {r && (
        <div className="rec-grid">
          <Record
            icon="🏏" title="Highest score" accent="var(--hunter)" who={r.highestScore}
            value={r.highestScore && `${r.highestScore.runs}${r.highestScore.notOut ? '*' : ''}`}
            detail={r.highestScore && `${r.highestScore.balls} balls · ${r.highestScore.fours}×4 ${r.highestScore.sixes}×6 · vs ${r.highestScore.against} · ${day(r.highestScore.when)}`}
            empty="No innings yet."
          />
          <Record
            icon="🎯" title="Best spell" accent="var(--sage)" who={r.bestSpell}
            value={r.bestSpell && `${r.bestSpell.wickets}/${r.bestSpell.runs}`}
            detail={r.bestSpell && `${r.bestSpell.overs} ov · vs ${r.bestSpell.against} · ${day(r.bestSpell.when)}`}
            empty="No wickets yet."
          />
          <PeopleRecord
            icon="5️⃣0️⃣" title="50s" accent="var(--lime)"
            items={r.fifties.map((f) => ({ ...f, value: `×${f.count}`, detail: `best ${f.best}` }))}
            empty="Nobody has made a 50 yet. Be the first."
          />
          <PeopleRecord
            icon="🎩" title="Hat-tricks" accent="var(--brick)"
            items={r.hattricks.map((h) => ({ ...h, value: `×${h.count}` }))}
            empty="Nobody has taken a hat-trick yet. Run outs don't count."
          />
          <PeopleRecord
            icon="💣" title="Six machine" accent="var(--hunter)"
            items={(r.sixMachine?.players ?? []).map((p) => ({ ...p, value: r.sixMachine.sixes, detail: 'sixes in total' }))}
            empty="No sixes hit yet."
          />
          <PeopleRecord
            icon="🦆" title="Most ducks" accent="var(--brick)"
            items={(r.mostDucks?.players ?? []).map((p) => ({ ...p, value: r.mostDucks.ducks, detail: r.mostDucks.ducks === 1 ? 'duck (out for 0)' : 'ducks (out for 0)' }))}
            empty="No ducks yet. Nobody has been out for 0."
          />
          <article className="rec cut" style={{ '--accent': 'var(--sage)' }}>
            <div className="rec-title"><span aria-hidden="true">🤝</span><small>Highest partnership</small></div>
            {r.bestPartnership ? (
              <div className="rec-body">
                <div className="pair">{r.bestPartnership.players.map((p) => <Avatar key={p.name} name={p.name} photo={p.photo} size={42} />)}</div>
                <div className="rec-who">
                  <b>{r.bestPartnership.players.map((p) => p.name).join(' & ')}</b>
                  <small>{r.bestPartnership.balls} balls · {r.bestPartnership.team} vs {r.bestPartnership.against} · {day(r.bestPartnership.when)}</small>
                </div>
                <span className="rec-value">{r.bestPartnership.runs}</span>
              </div>
            ) : <p className="home-none">No partnership between two saved players yet.</p>}
          </article>
          <article className="rec cut" style={{ '--accent': 'var(--moss)' }}>
            <div className="rec-title"><span aria-hidden="true">🏆</span><small>Most won team</small></div>
            {r.mostWins ? (
              <>
                <div className="rec-avatars">{r.mostWins.players.map((p) => <Avatar key={p.name} name={p.name} photo={p.photo} size={38} />)}</div>
                <div className="rec-body">
                  <div className="rec-who">
                    <b>{r.mostWins.players.map((p) => p.name).join(', ')}</b>
                    <small>{r.mostWins.wins} win{r.mostWins.wins === 1 ? '' : 's'} from {r.mostWins.played} · {r.mostWins.winPct}% · played as {r.mostWins.names.join(', ')}</small>
                  </div>
                  <span className="rec-value">{r.mostWins.wins}</span>
                </div>
              </>
            ) : <p className="home-none">No team has won a match yet.</p>}
          </article>
        </div>
      )}

      {latest !== undefined && (
        <section className="home-match">
          <h2 className="home-h">{latest?.status === 'in_progress' ? 'Current match' : 'Last match'}</h2>
          {latest ? <MatchCard key={latest.id} m={latest} startOpen /> : <div className="notice">No saved matches yet. Score a match and it shows up here.</div>}
        </section>
      )}
      <AccountBar />
    </div>
  );
}
