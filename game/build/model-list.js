// The list of shipped models behind `virtual:model-list` (vite.config.js). Pure node code so the scan is tested.
// Models live flat in public/assets/models/ and, for a location with many pieces, in one named subfolder
// (`town/`). Names stay globally unique and inside [a-z0-9_]; the client asks MODEL_DIRS where a name lives.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Subfolders of public/assets/models/ that hold models (one level, lowercase names). */
export const MODEL_SUBDIRS = Object.freeze(['town']);

const FILE_RE = /^([a-z0-9_]{1,64})\.glb$/;

/**
 * @param {string} dir absolute path of public/assets/models
 * @param {{subdirs?: readonly string[]}} [o]
 * @returns {{files: Record<string, number>, dirs: Record<string, string>}} files: name -> bytes;
 *   dirs: name -> 'sub/' for every model outside the flat folder (a flat file wins over a duplicate name)
 */
export function scanModels(dir, { subdirs = MODEL_SUBDIRS } = {}) {
  const files = {}, dirs = {};
  if (!existsSync(dir)) return { files, dirs };
  const scan = (folder, prefix) => {
    if (!existsSync(folder)) return;
    for (const f of readdirSync(folder).sort()) {
      const m = FILE_RE.exec(f);
      if (!m || m[1] in files) continue;
      const st = statSync(resolve(folder, f));
      if (!st.isFile()) continue;
      files[m[1]] = st.size;
      if (prefix) dirs[m[1]] = prefix;
    }
  };
  scan(dir, '');
  for (const sub of subdirs) if (/^[a-z0-9_]{1,32}$/.test(sub)) scan(resolve(dir, sub), sub + '/');
  return { files, dirs };
}

/** Source of the virtual module. */
export function modelListSource(dir, o) {
  const { files, dirs } = scanModels(dir, o);
  return 'export const MODEL_FILES = ' + JSON.stringify(files) + ';\nexport const MODEL_DIRS = ' + JSON.stringify(dirs) + ';\n';
}
