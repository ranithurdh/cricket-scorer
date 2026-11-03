import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STAGE = 260; // on-screen circle, CSS px
const OUT = 256;   // saved image, px: plenty for a leaderboard circle, ~30 KB as JPEG

// Pick the part of a photo that shows in the circle: drag to move, slider to zoom. Saves a 256px square JPEG.
export default function FaceCropper({ file, onCancel, onSave }) {
  const [url, setUrl] = useState(null);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image centre relative to the circle centre
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const drag = useRef(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { setImg(im); setUrl(u); };
    im.onerror = () => setErr('Could not read that image.');
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const w = img?.naturalWidth ?? 1, h = img?.naturalHeight ?? 1;
  const base = STAGE / Math.min(w, h);   // zoom 1 = the photo just covers the circle
  const scale = base * zoom;
  const limit = (p, s) => {              // keep the photo covering the circle
    const mx = Math.max(0, (w * s - STAGE) / 2), my = Math.max(0, (h * s - STAGE) / 2);
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };

  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { sx: e.clientX, sy: e.clientY, p: pos }; };
  const move = (e) => {
    const d = drag.current;
    if (d) setPos(limit({ x: d.p.x + e.clientX - d.sx, y: d.p.y + e.clientY - d.sy }, scale));
  };
  const up = () => { drag.current = null; };
  const zoomTo = (z) => { setZoom(z); setPos((p) => limit(p, base * z)); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const c = document.createElement('canvas');
      c.width = c.height = OUT;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT); // transparent PNGs get a white backdrop
      ctx.imageSmoothingQuality = 'high';
      const side = STAGE / scale; // the circle's square, in photo pixels
      ctx.drawImage(img, w / 2 - (STAGE / 2 + pos.x) / scale, h / 2 - (STAGE / 2 + pos.y) / scale, side, side, 0, 0, OUT, OUT);
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) throw new Error('could not process that image');
      await onSave(blob); // the parent closes this once the upload succeeds
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label="Choose a face">
      <div className="modal-card">
        <h2>Choose the face</h2>
        {!img && !err && <p className="crop-note">Loading…</p>}
        {img && (
          <>
            <div className="crop-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <img
                src={url} alt="" draggable={false}
                style={{ left: STAGE / 2 + pos.x - (w * scale) / 2, top: STAGE / 2 + pos.y - (h * scale) / 2, width: w * scale, height: h * scale }}
              />
            </div>
            <p className="crop-note">Drag to move · slide to zoom</p>
            <input
              className="crop-zoom" type="range" min="1" max="4" step="0.02" value={zoom}
              onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom"
            />
          </>
        )}
        {err && <small className="set-err">{err}</small>}
        <div className="set-actions">
          <button className="option cut confirm" disabled={!img || busy} onClick={save}>{busy ? 'Saving…' : 'Save face'}</button>
          <button className="option cut" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
