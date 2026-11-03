import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSettings, uploadSettingImage, removeSettingImage, saveBackgroundOpacity } from './api';

const CACHE_KEY = 'site-settings-v1'; // last known URLs, so the look appears instantly on reload
const EMPTY = { background: null, icon: null, backgroundOpacity: 60 };
const DEFAULT_ICON = 'data:,'; // blank icon until one is set, avoids a /favicon.ico 404

const readCache = () => {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(CACHE_KEY)) }; } catch { return EMPTY; }
};
const writeCache = (s) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

function apply({ background, icon, backgroundOpacity }) {
  const body = document.body;
  body.style.setProperty('--site-veil', String(1 - backgroundOpacity / 100)); // cream tint laid over the image
  if (background) {
    body.style.setProperty('--site-bg', `url("${background}")`);
    body.classList.add('has-bg');
  } else {
    body.style.removeProperty('--site-bg');
    body.classList.remove('has-bg');
  }
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.removeAttribute('type'); // let the browser sniff png / jpeg / ico
  link.href = icon || DEFAULT_ICON;
}

// Loads the saved background + icon from the server and applies them to the page.
export function useSiteSettings() {
  const [settings, setSettings] = useState(readCache);
  const [error, setError] = useState('');

  useEffect(() => { apply(settings); }, [settings]);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSettings();
      const next = { background: s.background, icon: s.icon, backgroundOpacity: s.backgroundOpacity ?? 60 };
      writeCache(next);
      setSettings(next);
      setError('');
    } catch {
      setError('Could not load saved settings (is the server running?)');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const change = useCallback(async (name, blobOrNull) => {
    if (blobOrNull) await uploadSettingImage(name, blobOrNull);
    else await removeSettingImage(name);
    await refresh();
  }, [refresh]);

  // Slider moves the page live; the value is saved shortly after you stop dragging.
  const timer = useRef(null);
  const setOpacity = useCallback((value) => {
    setSettings((s) => { const next = { ...s, backgroundOpacity: value }; writeCache(next); return next; });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveBackgroundOpacity(value).then(() => setError(''), () => setError('Could not save the opacity (is the server running?)'));
    }, 400);
  }, []);

  return { settings, error, change, setOpacity };
}

// ---- image prep: shrink in the browser so uploads stay small and fast ----
function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
    img.src = url;
  });
}
const toBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

// Background: longest side capped at 1920px, saved as JPEG (photos) or kept PNG-sized small.
export async function prepareBackground(file) {
  const img = await load(file);
  const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const blob = await toBlob(c, 'image/jpeg', 0.85);
  if (!blob) throw new Error('could not process that image');
  return blob;
}

// Tab icon: centre-cropped square, 128px PNG (keeps transparency). .ico files the browser can't decode go up as-is.
export async function prepareIcon(file) {
  let img;
  try { img = await load(file); } catch (e) {
    if (/icon/.test(file.type) || /\.ico$/i.test(file.name)) return new Blob([file], { type: 'image/x-icon' });
    throw e;
  }
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 128, 128);
  const blob = await toBlob(c, 'image/png');
  if (!blob) throw new Error('could not process that image');
  return blob;
}
