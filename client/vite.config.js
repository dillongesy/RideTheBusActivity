import { defineConfig } from 'vite';

// Discord serves the Activity through its proxy, which rewrites requests to our
// tunnel. During local dev we proxy /api and /ws to the backend on :3001.
export default defineConfig({
  server: {
    port: 5173,
    // Allow the cloudflared / Discord proxy hostnames to load the dev server.
    allowedHosts: true,
    // HMR must speak over the tunnel's HTTPS port when running inside Discord.
    hmr: {
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
