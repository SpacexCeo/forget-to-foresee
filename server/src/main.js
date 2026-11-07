#!/usr/bin/env node
// Starts the agent API server.  Usage: node server/src/main.js [--port 8787] [--host 127.0.0.1]
//   [--max-time-scale 1000] [--no-client-seed]
// Requires `cd game && npm install` once (the room reuses the client's collision and greybox
// modules, which import three.js for geometry helpers).
import { createServer } from './server.js';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const port = Number(opt('port', process.env.PORT || 8787));
const host = opt('host', process.env.HOST || '127.0.0.1');
const app = createServer({
  registry: { maxTimeScale: Number(opt('max-time-scale', 1000)), allowClientSeed: !argv.includes('--no-client-seed') },
  log: (e) => { if (process.env.FTF_LOG !== '0') console.log(`${e.method} ${e.route} ${e.status} ${e.ms}ms${e.session ? ' ' + e.session : ''}`); },
});
const addr = await app.listen(port, host);
console.log(`Forget to Foresee agent API listening on http://${addr.address}:${addr.port}/v1  (OpenAPI: /v1/openapi.yaml, catalog: /v1/actions)`);
console.log('Test sessions only: no real accounts, no wallet signing, no transfers.');
const stop = () => app.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
