import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import GraphicApp from './Graphic.jsx';
import { GRAPHIC_PATH } from './config';
import './styles.css';

// The stream graphic is a hidden page: no tab, no link. It opens at /scorebug or /#/scorebug (the word is GRAPHIC_PATH in config.js).
const clean = (s) => s.replace(/^[#/]+|\/+$/g, '').toLowerCase();
const isGraphic = () => clean(window.location.pathname) === GRAPHIC_PATH || clean(window.location.hash) === GRAPHIC_PATH;

function Root() {
  const [graphic, setGraphic] = useState(isGraphic);
  useEffect(() => {
    const update = () => setGraphic(isGraphic());
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  return graphic ? <GraphicApp /> : <App />;
}

createRoot(document.getElementById('root')).render(<Root />);

// Installable app: register the service worker in the built app (not in `npm run dev`, where it would cache stale code).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
