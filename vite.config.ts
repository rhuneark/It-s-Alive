import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rundotGameLibrariesPlugin, rundotMultiplayerPlugin } from '@series-inc/rundot-game-sdk/vite';

// CDN assets in cdn/ folder are automatically served in dev mode

/** Short commit + build time, shown on the title screen so we know which build a phone runs. */
function buildStamp(): string {
  let sha = process.env['GITHUB_SHA']?.slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      sha = 'dev';
    }
  }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default defineConfig({
  plugins: [
    react(), // Must come first - handles JSX transform
    rundotGameLibrariesPlugin(),
    // Live battles: builds src/rooms (rundot/realtime.config.json) for RUN's servers, and runs a
    // local room server for `npm run dev` (each browser tab plays as its own fake player).
    // (MP_DEV_PORT: the e2e tests' own room server, so they never clash with `npm run dev`.)
    rundotMultiplayerPlugin({ devPort: Number(process.env['MP_DEV_PORT']) || 9001 }),
  ],
  base: './',
  define: {
    __BUILD__: JSON.stringify(buildStamp()),
  },
  server: {
    allowedHosts: true,
  },
  // Vite uses esbuild both for transforms and (in dev) dependency prebundling.
  // RUN.game SDK includes top-level await, so we must target an environment that supports it.
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022', // Support top-level await for embedded libraries
  },
});
