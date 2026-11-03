import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// /api goes to the Express server, so the app (and your phone via the network URL) needs no CORS setup.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
