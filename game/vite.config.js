// Vite config: game, UI preview and asset review entry points and a virtual module that
// lists the .glb files present in public/assets/models/ (and its town/ subfolder), so the client only requests models that
// exist and shows a labeled greybox for the rest (no 404 noise, no SPA fallback confusion).
import { defineConfig } from 'vite';
import { chunkFor } from './build/chunks.js';
import { resolve } from 'node:path';
import { modelListSource } from './build/model-list.js';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, rmSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const MODELS_DIR = resolve(ROOT, 'public/assets/models');
const VIRTUAL_ID = 'virtual:model-list';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

function modelListPlugin() {
  return {
    name: 'ftf-model-list',
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : null; },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return modelListSource(MODELS_DIR); // MODEL_FILES (name -> bytes) and MODEL_DIRS (name -> subfolder, e.g. 'town/')
    },
    configureServer(server) {
      // Dropping a .glb into the folder reloads the page with the new list.
      server.watcher.add(MODELS_DIR);
      const onChange = (file) => {
        if (!file.replace(/\\/g, '/').includes('/public/assets/models/') || !file.endsWith('.glb')) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      server.watcher.on('change', onChange);
    },
  };
}

// Dev-only review rounds (?shells=r2) stay out of the production build: about 55 MB nobody loads (audit QW-8).
const DEV_ONLY_MODELS = /^shell_[1-4]_r2(_m)?\.glb$/;
function dropDevOnlyModelsPlugin() {
  let outDir = '';
  return {
    name: 'ftf-drop-dev-only-models',
    apply: 'build',
    configResolved(cfg) { outDir = resolve(cfg.root, cfg.build.outDir); },
    closeBundle() {
      const dir = resolve(outDir, 'assets/models');
      if (!existsSync(dir)) return;
      for (const f of readdirSync(dir)) if (DEV_ONLY_MODELS.test(f)) rmSync(resolve(dir, f));
    },
  };
}

export default defineConfig({
  // Public path: '/' locally; the GitHub Pages workflow builds with FTF_BASE=/forget-to-foresee/.
  base: process.env.FTF_BASE || '/',
  // 'mpa': a missing file is a real 404, never index.html.
  appType: 'mpa',
  plugins: [modelListPlugin(), dropDevOnlyModelsPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(ROOT, 'index.html'),
        review: resolve(ROOT, 'review.html'),
        vfx: resolve(ROOT, 'vfx.html'),
        uiPreview: resolve(ROOT, 'ui-preview.html'),
        hudPreview: resolve(ROOT, 'hud-preview.html'),
        shoal: resolve(ROOT, 'shoal.html'),   // the Glass Shoal look preview (flag glassShoal)
      },
      output: {
        // Chunk plan for the first seconds (docs/first-seconds.md): the entry stays tiny; `ui` (lobby, onboarding,
        // i18n) paints first; `three` + `client-core` + `scenes` are the world, imported lazily behind the lobby;
        // `play` (room, engine, world HUD, hub, map) only when the player enters; `locales` stay one chunk so a
        // language switch needs no network.
        manualChunks: chunkFor,
      },
    },
  },
  server: { port: 5173 },
});
