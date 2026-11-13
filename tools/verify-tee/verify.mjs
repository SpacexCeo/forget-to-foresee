#!/usr/bin/env node
// Independent check of a TEE agent answer from Forget to Foresee (docs/tee.md). Node 20+, no dependencies.
//
//   node tools/verify-tee/verify.mjs answer.json            # the JSON the relayer returned (or just its `tee` object)
//   node tools/verify-tee/verify.mjs --model <id>            # attestation only: is this model's signer in a real TEE?
//   options: --offline <report.json>  use a saved attestation report instead of fetching one (nonce not fresh)
//            --no-gpu                 skip the GPU vendor's online verdict
//            --base <url>             default https://cloud-api.near.ai ; NEARAI_API_KEY is sent when set
//
// Steps: (1) sha256 of the exact request and response bodies equal the hashes in the signed text; (2) the ECDSA
// signature over that text (EIP-191 personal_sign) recovers to the signing address; (3) a fresh attestation for that
// address, with our own nonce: Intel TDX quote chain to the Intel root, report data = address || our nonce, RTMR
// replay, measured docker compose, GPU evidence with our nonce (and the vendor's verdict). Prints PASS / FAIL.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checkSignature } from '../../relayer/lib/tee.js';
import { verifyModelAttestation } from '../../relayer/lib/tee-attest.js';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(k);
const base = opt('--base') || 'https://cloud-api.near.ai';
const headers = process.env.NEARAI_API_KEY ? { Authorization: 'Bearer ' + process.env.NEARAI_API_KEY } : {};
const line = (ok, label, extra = '') => console.log(`${ok === null ? 'SKIP' : ok ? ' ok ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);

export async function fetchAttestation({ model, signingAddress, offline = null }) {
  if (offline) {
    const rep = JSON.parse(readFileSync(offline, 'utf8'));
    const e = (rep.model_attestations || []).find((x) => !signingAddress || x.signing_address.toLowerCase() === signingAddress);
    return { entry: e, nonce: e ? e.request_nonce : null, fresh: false };
  }
  const nonce = randomBytes(32).toString('hex');
  const q = `model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${nonce}` + (signingAddress ? `&signing_address=${signingAddress}` : '');
  const rep = await (await fetch(`${base}/v1/attestation/report?${q}`, { headers })).json();
  const e = (rep.model_attestations || []).find((x) => !signingAddress || String(x.signing_address).toLowerCase() === signingAddress);
  return { entry: e, nonce, fresh: true };
}

async function main() {
  let ok = true;
  const file = args.find((a, i) => !a.startsWith('--') && !['--model', '--offline', '--base'].includes(args[i - 1]));
  let tee = null, model = opt('--model'), addr = null;
  if (file) {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    tee = j.tee || j;
    model = model || JSON.parse(tee.request_body).model;
    console.log(`Answer: chat ${tee.chat_id}, model ${model}`);
    const c = await checkSignature({ requestBody: tee.request_body, responseBody: tee.response_body, sig: { text: tee.signed_text, signature: tee.signature, signing_address: tee.signing_address } });
    line(c.request_hash_ok, 'request body hash matches the signed text', c.requestHash.slice(0, 16) + '…');
    line(c.response_hash_ok, 'response body hash matches the signed text', c.responseHash.slice(0, 16) + '…');
    line(c.signature_ok, 'ECDSA signature recovers to the signing address', String(c.recovered));
    ok = c.request_hash_ok && c.response_hash_ok && c.signature_ok;
    addr = c.recovered;
    try { const content = JSON.parse(tee.response_body).choices[0].message.content; console.log(`      signed answer: ${JSON.stringify(String(content).slice(0, 200))}`); } catch { /* not a chat body */ }
  }
  if (!model) { console.error('usage: verify.mjs answer.json | --model <id>'); process.exit(2); }
  const { entry, nonce, fresh } = await fetchAttestation({ model, signingAddress: addr, offline: opt('--offline') });
  line(!!entry, `attestation report lists the signer (${fresh ? 'fresh nonce ' + nonce.slice(0, 12) + '…' : 'saved report, nonce not fresh'})`);
  if (!entry) ok = false;
  else {
    const r = await verifyModelAttestation(entry, { signingAddress: addr || entry.signing_address, nonce, nras: !flag('--no-gpu') && fresh });
    const names = { address_matches: 'attested address', tdx_quote: 'Intel TDX quote: signature, QE report, PCK chain to the Intel SGX Root CA', report_data_binds_address: 'report data binds the signing address', report_data_binds_nonce: 'report data binds our nonce', rtmrs_replay: 'RTMR0-3 equal the event log replay', compose_hash_measured: 'docker compose hash measured into RTMR3', gpu_nonce: 'GPU evidence carries our nonce', gpu_verdict: 'GPU vendor attestation verdict' };
    for (const [k, v] of Object.entries(r.checks)) line(v, names[k] || k, k === 'tdx_quote' && !v ? String(r.quoteReason) : '');
    console.log(`      app ${r.summary.app_name}, compose ${String(r.summary.compose_hash).slice(0, 16)}…, GPU ${r.summary.gpu_arch} x${r.summary.gpu_count}`);
    for (const im of r.summary.images) console.log(`      image ${im}`);
    console.log('      not checked here: Intel TCB level and revocation (run the official verifier, docs/tee.md)');
    ok = ok && r.pass;
  }
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
