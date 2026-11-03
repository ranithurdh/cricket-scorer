import { useEffect, useState } from 'react';

const COLOURS = ['#386641', '#6a994e', '#587a2c', '#2f5233', '#4d7a5c', '#7d8f3a', '#a08a4a', '#5b6b3a']; // palette greens + earth
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = (name) => name.slice(0, 2).toUpperCase();

// A player's face in a circle; falls back to coloured initials when there's no photo (or it fails to load).
export default function Avatar({ name, photo, size = 40 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, '--av': COLOURS[hash(name.toLowerCase()) % COLOURS.length] }}>
      {photo && !broken
        ? <img src={photo} alt={name} draggable={false} onError={() => setBroken(true)} />
        : initials(name)}
    </span>
  );
}
