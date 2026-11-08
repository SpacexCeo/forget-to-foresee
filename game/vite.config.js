// Vite config: game, UI preview and asset review entry points and a virtual module that
// lists the .glb files present in public/assets/models/, so the client only requests models that
// exist and shows a labeled greybox for the rest (no 404 noise, no SPA fallback confusion).
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const MODELS_DIR = resolve(ROOT, 'public/assets/models');
const VIRTUAL_ID = 'virtual:model-list';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

function listModels() {
  if (!existsSync(MODELS_DIR)) return {};
  const out = {};
  for (const f of readdirSync(MODELS_DIR)) {
    const m = /^([a-z0-9_]{1,64})\.glb$/.exec(f);
    if (m) out[m[1]] = statSync(resolve(MODELS_DIR, f)).size;
  }
  return out;
}

function modelListPlugin() {
  return {
    name: 'ftf-model-list',
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : null; },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return 'export const MODEL_FILES = ' + JSON.stringify(listModels()) + ';\n';
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

export default defineConfig({
  // Public path: '/' locally; the GitHub Pages workflow builds with FTF_BASE=/forget-to-foresee/.
  base: process.env.FTF_BASE || '/',
  // 'mpa': a missing file is a real 404, never index.html.
  appType: 'mpa',
  plugins: [modelListPlugin()],
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
      },
      output: {
        manualChunks(id) {
          const p = id.replace(/\\/g, '/');
          if (p.includes('/node_modules/three/')) return 'three';
          if (p.includes('/src/render/') || p.includes('/src/physics/')) return 'client-core';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});
