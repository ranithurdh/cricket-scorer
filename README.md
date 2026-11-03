# SB Cricket

    npm install
    npm run dev      # open on your phone via the network URL

- `src/Setup.jsx`  match setup screen (teams, players, batting first, overs, balls per over, last man alone)
- `src/config.js`  default setup values and the rules not on the setup screen yet (wide/no-ball runs)
- `src/members.js` roster helpers (name matching) and the 8 default members that are copied into the database on first run; after that the roster is edited on the Settings page, and only saved players get leaderboard stats
- `src/roster.js`, `src/Avatar.jsx`, `src/FaceCropper.jsx` the saved-players hook (cached in localStorage), the face circle, and the drag-and-zoom photo picker
- `src/Home.jsx` the Home page (default page, `#/`): best batter / bowler / all-rounder, the records, and the current or last match (re-uses the Matches card). The scorer moved to `#/score`
- `src/Versus.jsx` the 1v1 page (`#/versus`): pick a player for their overall stats, rank on each board, and a head-to-head against every other saved player (batting vs each bowler, bowling to each batter)
- `src/Matches.jsx` the Matches page: every saved match with the winning team and its members, each batter's runs (balls) and each bowler's figures
- `src/Leaderboards.jsx` batting / bowling / fielding leaderboards (default sort: Overall rating)
- `src/ratings.js` the Overall rating (0-100) equations and the minimum-data thresholds
- `src/engine.js`  pure scoring logic: `computeState(config, events)`. All stats derive from the event list.
- `src/useMatch.js` event log + undo/redo + localStorage autosave
- `src/App.jsx`, `Field.jsx`, `Modals.jsx`  UI

Undo removes the last ball plus any player selections made after it.

## Backend (Express + MongoDB)

    cp .env.example .env     # defaults to local MongoDB (what Compass shows)
    npm install
    npm run dev:server       # API on :5000, database "dorm-cricket"
    npm run dev              # the app; Vite proxies /api to :5000

Switch to Atlas by changing only `MONGODB_URI` in `.env`.

Each match is stored as `config` + `events` (the source of truth) plus a derived summary
(result, winner, innings, per-player stats) rebuilt on every save with the same `engine.js`.

| Method | Route | |
|---|---|---|
| POST | `/api/matches` | save a match; send a `clientId` and re-posting updates instead of duplicating |
| GET | `/api/matches` | list (`?status=completed&team=&player=&limit=&page=`), no event log |
| GET | `/api/matches/cards` | scorecards for the Matches page, newest first (`?page=&limit=`), guests included |
| GET | `/api/matches/:id` | full match |
| PUT | `/api/matches/:id` | replace config/events, summary recomputed |
| DELETE | `/api/matches/:id` | delete |
| GET | `/api/stats/highlights` | Home page records from completed matches (saved players only): highest score, best spell, first fifty, first hat-trick, most-won team |
| GET | `/api/backup` | Download everything (matches + saved players with faces) as one JSON file |
| POST | `/api/auth/login` | `{ password }` → `{ role, token }`; the password decides the role (8 wrong tries per 10 min per address, then it waits) |
| PATCH | `/api/matches/:id/date` | Admin: set when a match was played |
| POST | `/api/matches/:id/abandon` | Admin: `{ abandoned }` mark an unfinished match abandoned (leaves Home) or restore it |
| POST | `/api/matches/:id/reopen` | Admin: the full match, to open in the scorer and correct |
| POST | `/api/backup/import` | Read a backup file back in. Adds only: matches with a known id/clientId and players with a known name are skipped |
| GET | `/api/stats/versus` | 1v1 data for `?player=Name`: maidens, stumpings, best figures and every batter-vs-bowler matchup (saved players only) |
| GET | `/api/stats/players` | career leaderboard from completed matches (`?player=Name`), each saved player with their `photo` URL |
| GET | `/api/players` | saved players: `{ players: [{ id, name, aliases, photo }] }` |
| POST | `/api/players` | add a player, body `{ name }` (409 if the name is taken) |
| PUT | `/api/players/:id` | rename, body `{ name }`; the old name is kept as an alias so past matches still count |
| DELETE | `/api/players/:id` | remove from the roster (matches are kept) |
| PUT / GET / DELETE | `/api/players/:id/photo` | the face: raw image bytes in, versioned image out |
| GET | `/api/health` | server + DB status |

Body for POST/PUT: `{ clientId?, playedAt?, config, events }`, exactly what the scorer already holds.
Players are matched across games by name (case-insensitive), so use consistent names.

## Stats

Only saved players (the dorm members, managed on the Settings page) are tracked; guests added in match setup can play but get no stats.
Adding, renaming or removing a player rebuilds the saved matches' player rows automatically, so a new player's earlier games count straight away.
Leaderboards use completed matches only.

- Batting: average (runs per dismissal), strike rate, high score, boundary % (4s and 6s per ball faced), dot ball % (balls faced with no runs off the bat)
- Bowling: wickets, average (runs per wicket), economy (runs per over), dot ball % (legal balls with no runs at all), extras (runs from wides and no-balls)
- Fielding: catches, run outs, dropped catches (the Dropped catch button on the Score page), catch % (catches / (catches + drops))

### Overall rating (default leaderboard sort)

Each stat is min-max normalised across the players being rated, "lower is better" stats are flipped (1 - X'), then weighted and scaled to 0-100. Totals are turned into rates first (per match / per over) so playing more doesn't beat playing well.

| Board | Formula (weights) |
|---|---|
| Batting | Average 30%, Strike rate 25%, Boundary % 20%, Dot ball % 15% (inverted), High score 10% |
| Bowling | Wickets per match 30%, Economy 25% (inverted), Average 20% (inverted), Dot ball % 15%, Extras per over 10% (inverted) |
| Fielding | Catches per match 35%, Run outs per match 25%, Catch % 25%, Dropped per match 15% (inverted) |

- A player is rated once they have 3 innings (batting), 5 overs bowled (bowling) or 3 matches (fielding); below that they are listed unrated. If fewer than 2 players qualify, everyone with data is rated. Change this in `MIN` at the top of `src/ratings.js`.
- Never dismissed: batting average falls back to total runs. No wickets / no catch chances: that part scores 0.

After changing how stats are calculated, run `npm run recompute` to rebuild saved matches. `npm run test:stats` checks the maths.

## Settings page

The gear tab opens Settings: upload a background image (with a visibility slider) and a tab icon. The scoring page always stays plain beige. Both are stored in MongoDB (`settings` collection, one document), shrunk in the browser first (background max 1920px JPEG, icon 128px PNG), and served from `/api/settings/background` and `/api/settings/icon`, so every device sees them.

### Saved players and faces

Settings → **Saved players** lists the dorm roster. Add a player, tap **Edit** to rename them, add or change their face, or delete them.

- Players live in MongoDB (`players` collection). The first time the server starts it copies the 8 defaults from `src/members.js` into it; after that the database is the source of truth, so the list is the same on every device. A copy is also kept in the browser so match setup still works if the server is unreachable.
- A face is picked from a photo, positioned by dragging and zooming inside a circle, then saved as a 256px JPEG in the player's document and served from `/api/players/:id/photo`. The same circle shows in the leaderboards (podium, rows and the best-of cards); players without a face show coloured initials.
- Renaming keeps history: the old name is stored as an alias, so matches already saved under it still count for the player. Deleting only removes them from the roster and leaderboards; their matches stay, and adding the same name back restores their stats.
- `npm run recompute` uses the saved players too.

## Home page

- **Best batter / bowler**: top Overall rating on the Batting / Bowling leaderboards. **Best all-rounder**: the highest average of a player's batting and bowling ratings (they need a rating in both).
- **Highest score**: biggest innings by a saved player (fewer balls wins a tie). **Best spell**: most wickets in one match, then fewest runs, then fewest balls.
- **50s**: everyone who has scored 50 or more in an innings, with how many times and their best. **Hat-tricks**: everyone who has taken one, with how many. A hat-trick is three wickets in a row from the bowler's own deliveries (a wide/no-ball that takes no wicket doesn't break it; **run outs are not the bowler's wicket and break it**; four in a row counts as one).
- **Six machine**: the most sixes overall (ties are all shown). **Most ducks**: the most innings out for 0, run outs included (ties are all shown).
- **Highest partnership**: the most runs scored by two saved players while batting together, extras included.
- **Most won team**: a team is its set of saved players, not its name, so the same four people under different names count as one team (guests are ignored). It shows the players, wins from matches played, and the names it has used.
- **Current / last match**: the newest saved match, shown exactly like the Matches page (labelled "Current match" while it's in progress).
- Computed by `server/highlights.js` from each match's saved rows and stored facts (see *Stored stats* below); `npm run test:highlights` checks it.

## 1v1 page

Computed by `server/versus.js` from the facts stored on each completed match; `npm run test:versus` checks it. Only matchups between saved players are counted (guests are skipped).

- **Maiden over**: a full over bowled by one bowler that cost him no runs. Runs off the bat, wides and no-balls count against him; byes and leg byes don't.
- **Stumpings**: stumped dismissals credited to the fielder picked on the dismissal screen.
- **Best figures**: most wickets in a match, then fewest runs.
- **Rank**: place on the Overall-rating board for batters, bowlers and fielders (unrated players show how much more they need).
- **Batting vs a bowler**: runs, balls, strike rate, average, 4s/6s, dot %, times out (bowler-credited only, run outs excluded) and the bowler's economy against him. **Bowling to a batter**: wickets, runs off the bat, economy, average, dots, 4s/6s. The "best / hardest" rate cards need at least 6 balls of data.

## Delete, backup and import

- **Delete a match**: every card on the Matches page has a *Delete match* button (asks first). It removes the match from the database and so from the leaderboards, Home and 1v1.
- **Backup**: the *Backup* button on the Matches page downloads `cricket-backup-YYYY-MM-DD.json`: every match (setup + ball-by-ball events) and the saved players with their faces. The site background and tab icon aren't included.
- **Import**: Settings → *Import backup*. It only adds, so importing the same file twice is harmless, and it brings back matches you deleted. Stats are rebuilt from the ball-by-ball data, so nothing depends on the file's totals.

## Roles and passwords

Set both in `.env` (see `.env.example`). If you don't, the defaults are `admin` and `scorer` and the server prints a warning.

| | Viewer (no password) | Scorer | Admin |
|---|---|---|---|
| Home, Leaderboards, 1v1, Matches (read) | ✓ | ✓ | ✓ |
| Score matches (the Score tab, saving a match) | | ✓ | ✓ |
| Delete a match, Backup, Settings (players, faces, images, Import backup) | | | ✓ |

- Either password goes in the same box; the server says which role it is. Sign in from the Score or Settings tab, or at the bottom of Home (which also has Sign out).
- The server enforces this (`server/auth.js`): saving a match needs a scorer or admin token, and deleting, settings, players and backup/import need an admin token. Hiding buttons is only a convenience.
- Login tokens last 30 days and are kept in the browser. Changing a password (or `AUTH_SECRET`) signs everybody out.
- A match being scored stays in the browser while signed out, and carries on after signing back in.
- `npm run test:auth` checks the roles and tokens.

## Stored stats (nothing is recalculated from scratch)

- When a match is saved, the server works out its **facts** once (`server/facts.js`): hat-tricks, best partnership, maidens, stumpings and every batter-vs-bowler matchup. They are stored on the match, next to its per-player rows.
- The **Leaderboards, Home and 1v1** results are built by adding up those stored numbers, and the finished result is **saved too** (`StatCache` collection). A saved result is reused until something it depends on changes: a finished match saved, edited or deleted, a player added / renamed / removed, or an import. Scoring a ball of a match still in progress changes nothing, and a new finished match only has its own facts worked out, then the totals are re-added.
- Nothing replays old matches' ball-by-ball logs to build these pages. The one exception is when a player is added, renamed or removed, because every match's rows have to be rebuilt for the new roster.
- On startup the server fills in the facts for any match saved before this existed (it logs how many). If you ever change the maths in `facts.js`, bump `FACTS_VERSION` and restart; `npm run recompute` rebuilds everything by hand.

## Editing matches (admin) and Save now

- **Matches page, admin only**, on every card: **Edit in scorer** (opens that match on the Score page; use Undo / Redo and keep scoring to correct it, and every change saves to the same match, re-calculating its stats), **Set date** (changes when it was played, which also fixes its order), **Mark abandoned / Restore** (unfinished matches only; an abandoned match leaves the Home page but stays on the Matches page), and **Delete match**.
- Finishing an abandoned match un-abandons it.
- **Save now** (💾, left side of the Score page): saves the match to the database straight away, with a confirmation message and the time of the last save. Matches also still save automatically after every ball.

## Super over

- When a match ends tied, the Match over screen asks **Play super over / No, keep it tied**. A super over is one over each with the same teams and rules; the team that batted second bats first. If it ties too, you are asked again (the batting order swaps each time).
- It is stored in the **same match's event log** (`super_over` / `no_super_over` events), so Undo works across it, it is saved by Save now and autosave, and it shows on the Matches page as a "Super over" section plus "SO 10/0" next to each team's score.
- While a super over is being played the match counts as in progress (Home shows it as current). When it ends the match is completed and **the super over winner becomes the match winner** (result reads "Match tied, Blues won the super over").
- Super over runs, wickets and catches are **not** counted in player stats, leaderboards, hat-tricks or 1v1; only the win/loss is. `npm run test:superover` checks it.

## Install as an app (PWA)

- `public/manifest.webmanifest` + icons make the site installable; `public/sw.js` keeps the app itself available offline (it never caches `/api`). It is only registered in the built app, not in `npm run dev`.
- Installing needs **https** (localhost is exempt), so `http://192.168.x.x` on your phone will not offer it. Deploy, then open the https address on the phone: Android Chrome → menu → *Install app*; iPhone Safari → Share → *Add to Home Screen*.
- Build and run as one server: `npm run build` then `npm run server`. It serves `dist/` as well as `/api`, so one https address does everything. (Or host `dist/` on Netlify/Vercel and proxy `/api` to the server.)
- Scoring offline: the match is kept in the browser after every ball, and when the phone comes back online it saves to the database automatically. Stats pages need a connection.
- After shipping a change, bump `CACHE` in `sw.js` if old files ever stick.

## Deploy on Vercel (free) with MongoDB Atlas

- `api/index.js` and `api/[...path].js` run `server/handler.js`, which wraps the Express app (`server/app.js`) as a Vercel function; `api/[...path].js` (a catch-all) receives every `/api/*` request and Vercel serves the built site. `server/db.js` connects to MongoDB on demand and does the start-up work once per instance. `npm run server` still works for running it yourself (`server/index.js`).
- Environment variables (Vercel → Project → Settings → Environment Variables): `MONGODB_URI`, `ADMIN_PASSWORD`, `SCORER_PASSWORD`, `AUTH_SECRET`.
- Atlas → Network Access must allow `0.0.0.0/0` (Vercel's addresses change).
- Limits: Vercel accepts ~4.5 MB per request and reply. Uploaded backgrounds are capped at 4 MB, Import backup at 4 MB, and Backup download fails if the file would pass 4.5 MB. If that ever happens, export/import from a local copy (`npm run dev:server` pointed at the same Atlas database).
- The wrong-password limiter lives in MongoDB (`loginfails`, auto-expiring) so it works across instances.
- Redeploy by pushing to GitHub. If phones keep an old version, bump `CACHE` in `public/sw.js`.
