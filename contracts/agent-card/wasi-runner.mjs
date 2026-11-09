// Runs a wasm32-wasip1 test binary under Node's WASI. Used as the cargo runner for
// `cargo test --lib --target wasm32-wasip1` (see .cargo/config.toml).
import { readFileSync } from 'node:fs';
import { WASI } from 'node:wasi';
import process from 'node:process';

const [file, ...args] = process.argv.slice(2);
const wasi = new WASI({ version: 'preview1', args: [file, ...args], env: process.env, returnOnExit: true });
const module = await WebAssembly.compile(readFileSync(file));
const imports = { wasi_snapshot_preview1: wasi.wasiImport };
// The pure tests never call NEAR host functions; stub any that are imported so the module links.
for (const imp of WebAssembly.Module.imports(module)) {
  if (imp.module === 'wasi_snapshot_preview1' || imp.kind !== 'function') continue;
  imports[imp.module] ??= {};
  imports[imp.module][imp.name] = () => { throw new Error(`NEAR host function ${imp.name} is not available in pure tests`); };
}
const instance = await WebAssembly.instantiate(module, imports);
try {
  process.exitCode = wasi.start(instance);
} catch (e) {
  // a failed assertion aborts the wasm instance (panic=abort on wasm32-wasip1)
  console.error(`wasm test binary aborted: ${e.message}`);
  process.exitCode = 101;
}