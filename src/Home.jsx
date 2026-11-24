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

// Everyone with a batting and/or bowling rating. Players rated in both are ranked by the average of the two (the
// all-rounder score, same rule as the "Best all-rounder" card); players with only one rating are listed after them.
function boardOf(players) {
  const bat = overallRatings(players, 'batting', hasBat).map;
  const bowl = overallRatings(players, 'bowling', hasBowl).map;
  const rows = players
    .map((p) => {
      const b = bat.get(p.name)?.score ?? null, w = bowl.get(p.name)?.score ?? null;
      return { p, bat: b, bowl: w, both: b != null && w != null ? (b + w) / 2 : null };
    })
    .filter((r) => r.bat != null || r.bowl != null);
  const ranked = rows.filter((r) => r.both != null)
    .sort((a, b) => b.both - a.both || b.p.matches - a.p.matches || a.p.name.localeCompare(b.p.name));
  const rest = rows.filter((r) => r.both == null)
    .sort((a, b) => (b.bat ?? b.bowl) - (a.bat ?? a.bowl) || a.p.name.localeCompare(b.p.name));
  return { ranked, rest };
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

const fmt = (v) => (v == null ? '–' : v.toFixed(1));

function AllRounderBoard({ board }) {
  const { ranked, rest } = board;
  return (
    <section className="rec cut ar-board" style={{ '--accent': 'var(--lime)' }}>
      <div className="rec-title"><span aria-hidden="true">🏅</span><small>Leaderboard · best all-rounder</small></div>
      {ranked.length + rest.length === 0 ? <p className="home-none">Not enough matches yet.</p> : (
        <div className="ar-table">
          <div className="ar-row ar-head"><span /><span>Player</span><span>Bat</span><span>Bowl</span><span>All-round</span></div>
          {ranked.map((r, i) => (
            <div key={r.p.name} className="ar-row">
              <span className="ar-place">{i + 1}</span>
              <span className="ar-who"><Avatar name={r.p.name} photo={r.p.photo} size={30} /><b>{r.p.name}</b></span>
              <span>{fmt(r.bat)}</span><span>{fmt(r.bowl)}</span>
              <span className="ar-all">{fmt(r.both)}</span>
            </div>
          ))}
          {rest.map((r) => (
            <div key={r.p.name} className="ar-row dim">
              <span className="ar-place">–</span>
              <span className="ar-who"><Avatar name={r.p.name} photo={r.p.photo} size={30} /><b>{r.p.name}</b></span>
              <span>{fmt(r.bat)}</span><span>{fmt(r.bowl)}</span>
              <span className="ar-all">–</span>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && <small className="home-sub">Dimmed players need a rating in both batting and bowling to be ranked.</small>}
    </section>
  );
}

// A record card showing the top 3. rows: [{ key, avatars: [{ name, photo }], title, detail, value }]
function TopRecord({ icon, title, accent, rows, empty }) {
  return (
    <article className="rec cut" style={{ '--accent': accent }}>
      <div className="rec-title"><span aria-hidden="true">{icon}</span><small>{title}</small></div>
      {rows.length ? (
        <ol className="rec-top">
          {rows.slice(0, 3).map((row, i) => (
            <li key={row.key} className="rec-body">
              <span className="rec-rank">{i + 1}</span>
              <div className={row.avatars.length > 1 ? 'pair' : undefined}>
                {row.avatars.map((a) => <Avatar key={a.name} name={a.name} photo={a.photo} size={row.avatars.length > 1 ? 30 : 38} />)}
              </div>
              <div className="rec-who"><b>{row.title}</b>{row.detail && <small>{row.detail}</small>}</div>
              <span className="rec-value">{row.value}</span>
            </li>
          ))}
        </ol>
      ) : <p className="home-none">{empty}</p>}
    </article>
  );
}

// The server sends top-3 lists; if an older server answers, fall back to the single best it still sends.
const one = (x) => (x ? [x] : []);
const who = (x) => ({ name: x.name, photo: x.photo });
function topRows(r) {
  return {
    scores: (r.topScores ?? one(r.highestScore)).map((x) => ({
      key: `${x.name}-${x.when}-${x.runs}-${x.balls}`, avatars: [who(x)], title: x.name, value: `${x.runs}${x.notOut ? '*' : ''}`,
      detail: `${x.balls} balls · ${x.fours}×4 ${x.sixes}×6 · vs ${x.against} · ${day(x.when)}`,
    })),
    spells: (r.topSpells ?? one(r.bestSpell)).map((x) => ({
      key: `${x.name}-${x.when}`, avatars: [who(x)], title: x.name, value: `${x.wickets}/${x.runs}`,
      detail: `${x.overs} ov · vs ${x.against} · ${day(x.when)}`,
    })),
    fifties: r.fifties.map((x) => ({ key: x.name, avatars: [who(x)], title: x.name, value: `×${x.count}`, detail: `best ${x.best}` })),
    hattricks: r.hattricks.map((x) => ({ key: x.name, avatars: [who(x)], title: x.name, value: `×${x.count}` })),
    sixes: (r.topSixes ?? (r.sixMachine?.players ?? []).map((x) => ({ ...x, count: r.sixMachine.sixes }))).map((x) => ({
      key: x.name, avatars: [who(x)], title: x.name, value: x.count, detail: 'sixes in total',
    })),
    ducks: (r.topDucks ?? (r.mostDucks?.players ?? []).map((x) => ({ ...x, count: r.mostDucks.ducks }))).map((x) => ({
      key: x.name, avatars: [who(x)], title: x.name, value: x.count, detail: x.count === 1 ? 'duck (out for 0)' : 'ducks (out for 0)',
    })),
    partnerships: (r.topPartnerships ?? one(r.bestPartnership)).map((x) => ({
      key: `${x.players.map((p) => p.name).join('+')}-${x.when}`, avatars: x.players.map(who), title: x.players.map((p) => p.name).join(' & '),
      value: x.runs, detail: `${x.balls} balls · ${x.team} vs ${x.against} · ${day(x.when)}`,
    })),
    teams: (r.topTeams ?? one(r.mostWins)).map((x) => ({
      key: x.players.map((p) => p.name).join('+'), avatars: x.players.map(who), title: x.players.map((p) => p.name).join(', '),
      value: x.wins, detail: `${x.wins} win${x.wins === 1 ? '' : 's'} from ${x.played} · ${x.winPct}% · played as ${x.names.join(', ')}`,
    })),
  };
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
  const board = useMemo(() => (players ? boardOf(players) : null), [players]);
  const rows = useMemo(() => (records ? topRows(records) : null), [records]);
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
          <b>Can't reach the server.</b> Start it with <code>npm run dev:server</code> (and MongoDB), then retry. <small>Error: {error}</small>
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

      {board && <AllRounderBoard board={board} />}

      {r && (
        <div className="rec-grid">
          <TopRecord icon="🏏" title="Highest score · top 3" accent="var(--hunter)" rows={rows.scores} empty="No innings yet." />
          <TopRecord icon="🎯" title="Best spell · top 3" accent="var(--sage)" rows={rows.spells} empty="No wickets yet." />
          <TopRecord icon="5️⃣0️⃣" title="50s · top 3" accent="var(--lime)" rows={rows.fifties} empty="Nobody has made a 50 yet. Be the first." />
          <TopRecord icon="🎩" title="Hat-tricks · top 3" accent="var(--brick)" rows={rows.hattricks} empty="Nobody has taken a hat-trick yet. Run outs don't count." />
          <TopRecord icon="💣" title="Six machine · top 3" accent="var(--hunter)" rows={rows.sixes} empty="No sixes hit yet." />
          <TopRecord icon="🦆" title="Most ducks · top 3" accent="var(--brick)" rows={rows.ducks} empty="No ducks yet. Nobody has been out for 0." />
          <TopRecord icon="🤝" title="Highest partnership · top 3" accent="var(--sage)" rows={rows.partnerships} empty="No partnership between two saved players yet." />
          <TopRecord icon="🏆" title="Most won team · top 3" accent="var(--moss)" rows={rows.teams} empty="No team has won a match yet." />
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
