// Vercel function for /api itself; /api/<anything> is handled by [...path].js. Both just run server/handler.js.
export { default } from '../server/handler.js';
