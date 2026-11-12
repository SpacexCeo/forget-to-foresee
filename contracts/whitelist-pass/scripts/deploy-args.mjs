// Prints the owner's commands for the whitelist pass (near-cli-rs syntax, as the other contracts' READMEs). It signs
// nothing, sends nothing and reads no key: it only prints text for the owner to review and run in their own terminal.
// Every line says whether it is READ-ONLY or SIGNS (and with which account's key).
//
//   node scripts/deploy-args.mjs --network testnet --contract pass.you.testnet --owner you.testnet \
//        --minter minter.you.testnet [--cap 1000] [--daily 100] [--allowance "1 NEAR"]
//
// Owner-gated: docs/mainnet-pass-runbook.md says when each step runs. Rehearse on testnet first.
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const network = args.network || 'testnet';
const contract = args.contract || (network === 'mainnet' ? 'pass.<owner>.near' : 'pass.<owner>.testnet');
const owner = args.owner || (network === 'mainnet' ? '<owner>.near' : '<owner>.testnet');
const minter = args.minter || (network === 'mainnet' ? 'minter.<owner>.near' : 'minter.<owner>.testnet');
const cap = Number(args.cap || 1000), daily = Number(args.daily || 100);
const allowance = args.allowance || '1 NEAR';
if (!['testnet', 'mainnet'].includes(network)) { console.error('network: testnet or mainnet'); process.exit(1); }
if (!(cap > 0 && cap <= 10000 && daily > 0 && daily <= cap)) { console.error('need 0 < daily <= cap <= 10000'); process.exit(1); }
const init = JSON.stringify({ owner_id: owner, minter_id: minter, cap, daily_cap: daily });
const banner = network === 'mainnet' ? 'MAINNET: real NEAR is spent. Run only after the testnet rehearsal passed.' : 'TESTNET rehearsal.';
const lines = [
  `# ${banner}`,
  `# contract ${contract}, owner ${owner}, minter ${minter}, cap ${cap}, daily_cap ${daily}, minter allowance ${allowance}`,
  '',
  '# 1. Build and record the hash (READ-ONLY, local)',
  'bash contracts/whitelist-pass/scripts/build.sh',
  '',
  `# 2. Deploy the wasm and call new (SIGNS with ${contract}'s full-access key)`,
  `cd contracts/whitelist-pass && cargo near deploy build-non-reproducible-wasm --no-abi ${contract} with-init-call new json-args '${init}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config ${network} sign-with-keychain send`,
  '',
  `# 3. Give the minter a FUNCTION-CALL key: only mint_pass on ${contract}, hard gas allowance ${allowance} (SIGNS with ${minter}'s full-access key)`,
  `near account add-key ${minter} grant-function-call-access --allowance '${allowance}' --contract-account-id ${contract} --function-names 'mint_pass' autogenerate-new-keypair print-to-terminal network-config ${network} sign-with-keychain send`,
  '#    The printed private key goes ONLY into FTF_PASS_KEY on the relayer host (never the repo, CI, chat or a screenshot).',
  '',
  '# 4. Check (READ-ONLY)',
  `near contract call-function as-read-only ${contract} pass_info json-args '{}' network-config ${network} now`,
  `near account list-keys ${minter} network-config ${network} now`,
  `near account view-account-summary ${contract} network-config ${network} now   # code_hash = build.sh base58`,
  '',
  '# 5. After the first real pass reached the owner\'s own wallet through the relayer: make the code immutable',
  `near account list-keys ${contract} network-config ${network} now   # READ-ONLY: note every public key`,
  `near account delete-keys ${contract} public-keys <each-public-key-from-the-list> network-config ${network} sign-with-keychain send   # SIGNS with ${contract}'s key; IRREVERSIBLE`,
  `near account list-keys ${contract} network-config ${network} now   # READ-ONLY: must be empty`,
  '',
  `# Owner powers that remain (each SIGNS with ${owner}'s key):`,
  `#   near contract call-function as-transaction ${contract} pause json-args '{}' prepaid-gas '10.0 Tgas' attached-deposit '0 NEAR' sign-as ${owner} network-config ${network} sign-with-keychain send`,
  `#   (unpause, set_minter {"minter_id": "..."}, set_media {"media": "https://..."} the same way)`,
];
console.log(lines.join('\n'));
