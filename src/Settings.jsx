import { useEffect, useRef, useState } from 'react';
import { prepareBackground, prepareIcon } from './siteSettings';
import { importBackup } from './api';
import { useRoster } from './roster';
import Avatar from './Avatar';
import FaceCropper from './FaceCropper';

function ImageCard({ title, hint, value, round, onUpload, onReset }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.ico$/i.test(file.name)) { setErr('Please choose an image file.'); return; }
    setBusy(true); setErr('');
    try { await onUpload(file); } catch (ex) { setErr(ex.message || 'Upload failed'); }
    setBusy(false);
  };
  const reset = async () => {
    if (!window.confirm(`Remove the saved ${title.toLowerCase()}?`)) return;
    setBusy(true); setErr('');
    try { await onReset(); } catch (ex) { setErr(ex.message || 'Could not remove'); }
    setBusy(false);
  };

  return (
    <section className="set-card cut">
      <h2>{title}</h2>
      <small>{hint}</small>
      <div className={`set-preview ${round ? 'icon' : ''}`}>
        {value ? <img src={value} alt={`${title} preview`} /> : <span>Default</span>}
      </div>
      <div className="set-actions">
        <button className="option cut confirm" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Working…' : value ? 'Replace' : 'Upload'}</button>
        {value && <button className="option cut" disabled={busy} onClick={reset}>Remove</button>}
      </div>
      <input ref={input} type="file" accept="image/*,.ico" hidden onChange={pick} />
      {err && <small className="set-err">{err}</small>}
    </section>
  );
}

function PlayerRow({ p, open, busy, onToggle, onRename, onPhoto, onRemovePhoto, onDelete, onProblem }) {
  const [draft, setDraft] = useState(p.name);
  const [crop, setCrop] = useState(null); // photo file being cropped
  const input = useRef(null);
  useEffect(() => { setDraft(p.name); }, [p.name, open]);

  const changed = draft.trim() !== '' && draft.trim() !== p.name;
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { onProblem('Please choose an image file.'); return; }
    onProblem('');
    setCrop(file);
  };

  return (
    <li className="pl-row">
      <div className="pl-head">
        <Avatar name={p.name} photo={p.photo} size={48} />
        <div className="who">
          <b>{p.name}</b>
          <small>{p.photo ? 'Face saved' : 'No face yet'}</small>
        </div>
        <button className="chip-btn" disabled={!p.id} onClick={onToggle}>{open ? 'Done' : 'Edit'}</button>
      </div>
      {open && (
        <div className="pl-edit">
          <label className="pl-label">Name
            <input
              className="field-input" value={draft} maxLength={30}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && changed && onRename(draft)}
            />
          </label>
          <div className="set-actions">
            <button className="option cut confirm" disabled={busy || !changed} onClick={() => onRename(draft)}>Save name</button>
            <button className="option cut" disabled={busy} onClick={() => input.current.click()}>{p.photo ? 'Change face' : 'Add face'}</button>
            {p.photo && <button className="option cut" disabled={busy} onClick={onRemovePhoto}>Remove face</button>}
            <button className="option cut danger" disabled={busy} onClick={onDelete}>Delete player</button>
          </div>
          <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      )}
      {crop && (
        <FaceCropper
          file={crop}
          onCancel={() => setCrop(null)}
          onSave={async (blob) => { await onPhoto(blob); setCrop(null); }}
        />
      )}
    </li>
  );
}

function PlayersCard() {
  const { list, error, add, rename, remove, setPhoto, removePhoto } = useRoster();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Runs one change against the database and shows the server's message if it's refused.
  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); return true; } catch (ex) { setErr(ex.message || 'Something went wrong'); return false; } finally { setBusy(false); }
  };
  const addPlayer = async () => { if (name.trim() && await run(() => add(name))) setName(''); };

  return (
    <section className="set-card cut">
      <h2>Saved players</h2>
      <small>Dorm members who get leaderboard stats and appear as quick picks in match setup. Their face shows in the leaderboard circles.</small>
      <div className="player-row">
        <input
          className="field-input" value={name} maxLength={30} placeholder="New player name"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
        />
        <button className="btn cut add-btn" disabled={busy || !name.trim()} onClick={addPlayer}>Add</button>
      </div>
      {(err || error) && <small className="set-err">{err || error}</small>}
      {list.length === 0 && <small>No saved players yet. Add the first one above.</small>}
      <ul className="pl-list">
        {list.map((p) => (
          <PlayerRow
            key={p.id ?? p.name} p={p} open={openId === p.id && !!p.id} busy={busy}
            onToggle={() => { setErr(''); setOpenId(openId === p.id ? null : p.id); }}
            onRename={(n) => run(() => rename(p.id, n))}
            onPhoto={(blob) => setPhoto(p.id, blob)}
            onRemovePhoto={() => run(() => removePhoto(p.id))}
            onDelete={async () => {
              if (!window.confirm(`Delete ${p.name}? They leave the roster and the leaderboards. Past matches are kept, and adding the same name again brings their stats back.`)) return;
              if (await run(() => remove(p.id))) setOpenId(null);
            }}
            onProblem={setErr}
          />
        ))}
      </ul>
    </section>
  );
}

function ImportCard() {
  const { refresh } = useRoster();
  const input = useRef(null);
  const [file, setFile] = useState(null);   // { name, data, matches, players, exportedAt }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setDone(null); setFile(null);
    try {
      const data = JSON.parse(await f.text());
      if (data?.format !== 'dorm-cricket-backup' || !Array.isArray(data.matches)) throw new Error('bad format');
      setFile({ name: f.name, data, matches: data.matches.length, players: Array.isArray(data.players) ? data.players.length : 0, exportedAt: data.exportedAt });
    } catch { setErr("That isn't a cricket backup file. Use the Backup button on the Matches page to make one."); }
  };
  const run = async () => {
    setBusy(true); setErr('');
    try { setDone(await importBackup(file.data)); setFile(null); await refresh(); } catch (ex) { setErr(ex.message || 'Import failed'); }
    setBusy(false);
  };
  const n = (v, w) => `${v} ${w}${v === 1 ? '' : 's'}`;

  return (
    <section className="set-card cut">
      <h2>Import backup</h2>
      <small>Load a file made by the Backup button on the Matches page. It only adds: matches and players that are already saved are skipped, so nothing is overwritten or duplicated.</small>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={pick} />
      <div className="set-actions">
        <button className="option cut" disabled={busy} onClick={() => input.current?.click()}>Choose backup file</button>
      </div>
      {file && (
        <div className="notice">
          <span><b>{file.name}</b><br />{n(file.matches, 'match').replace('matchs', 'matches')} and {n(file.players, 'player')}{file.exportedAt ? ` · backed up ${new Date(file.exportedAt).toLocaleDateString()}` : ''}</span>
          <button className="chip-btn" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
        </div>
      )}
      {done && (
        <div className="notice">
          <span>
            Added {done.addedMatches === 1 ? '1 match' : `${done.addedMatches} matches`} and {n(done.addedPlayers, 'player')}.
            {done.skippedMatches > 0 && ` ${done.skippedMatches === 1 ? '1 match was' : `${done.skippedMatches} matches were`} already saved.`}
            {done.skippedPlayers > 0 && ` ${n(done.skippedPlayers, 'player')} skipped (already saved).`}
            {done.failedMatches > 0 && ` ${done.failedMatches === 1 ? '1 match' : `${done.failedMatches} matches`} couldn't be read.`}
          </span>
        </div>
      )}
      {err && <small className="set-err">{err}</small>}
    </section>
  );
}

export default function Settings({ settings, error, change, setOpacity }) {
  return (
    <div className="lb">
      <div className="page-title"><h1>Settings</h1></div>
      {error && <small className="set-err">{error}</small>}
      <PlayersCard />
      <ImportCard />
      <ImageCard
        title="Background image"
        hint="Shown behind every page. Large photos are shrunk automatically."
        value={settings.background}
        onUpload={async (f) => change('background', await prepareBackground(f))}
        onReset={() => change('background', null)}
      />
      {settings.background && (
        <section className="set-card cut">
          <h2>Background visibility</h2>
          <small>How much of the image shows through. Lower fades it into the beige.</small>
          <label className="set-slider">
            <input
              type="range" min="0" max="100" step="5"
              value={settings.backgroundOpacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label="Background visibility"
            />
            <b>{settings.backgroundOpacity}%</b>
          </label>
        </section>
      )}
      <ImageCard
        title="Tab icon"
        hint="The little icon on the browser tab. Square images work best."
        value={settings.icon}
        round
        onUpload={async (f) => change('icon', await prepareIcon(f))}
        onReset={() => change('icon', null)}
      />
      <small>Players, faces, the background and the icon are all saved in the database, so they apply on every device that opens the site.</small>
    </div>
  );
}
