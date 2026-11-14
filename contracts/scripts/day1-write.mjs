// Merges public Day 1 values into game/src/net/day1-deployment.<network>.js (FTF_NEAR_NETWORK=mainnet, else testnet):
// account ids and the guest key's PUBLIC part only.
//   node contracts/scripts/day1-write.mjs heroine=heroine.ftf-coordinator.testnet guestKeyPublic=ed25519:...
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const NET = process.env.FTF_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const NAME = `DAY1_DEPLOYMENT_${NET.toUpperCase()}`;
const FILE = new URL(`../../game/src/net/day1-deployment.${NET}.js`, import.meta.url);
let cur = {};
if (existsSync(FILE)) { const m = readFileSync(FILE, 'utf8').match(new RegExp('export const ' + NAME + ' = (\\{[\\s\\S]*?\\});')); if (m) cur = JSON.parse(m[1]); }
for (const a of process.argv.slice(2)) { const i = a.indexOf('='); if (i > 0) cur[a.slice(0, i)] = a.slice(i + 1); }
if (Object.values(cur).some((v) => /^ed25519:/.test(String(v)) && String(v).length > 60)) {
  // a public ed25519 key is 32 bytes (~44 base58 chars); refuse anything that looks like a secret
  for (const [k, v] of Object.entries(cur)) if (/^ed25519:/.test(String(v)) && String(v).replace('ed25519:', '').length > 50) throw new Error(`refusing to write ${k}: looks like a private key`);
}
if (Object.entries(cur).some(([k, v]) => /\.(testnet|near)$/.test(String(v)) && !String(v).endsWith(NET === 'mainnet' ? '.near' : '.testnet'))) throw new Error(`refusing to mix networks in the ${NET} record`);
cur.network = NET;
writeFileSync(FILE, `// Day 1 (free mint) deployment on NEAR ${NET}: public account ids and the guest key's public part, written by
// contracts/scripts/day1-*.sh. Never a private key: the guest key's secret is in the build environment (VITE_FTF_GUEST_KEY).
export const ${NAME} = ${JSON.stringify(cur, null, 2)};
`);
console.log('wrote', FILE.pathname, Object.keys(cur).join(', '));
