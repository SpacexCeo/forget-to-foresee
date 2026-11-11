// Checks a NEAR AI Cloud attestation entry (GET /v1/attestation/report) with Node's own crypto, no dependencies:
//  1. Intel TDX quote v4: the quote's ECDSA-P256 signature, the QE report signed by the PCK certificate, the QE report
//     binding the attestation key, and the PCK chain up to the pinned Intel SGX Root CA.
//  2. report_data = signing address (20 bytes, zero-padded to 32) || the request nonce (32 bytes).
//  3. RTMR0-3 in the quote equal a replay of tcb_info.event_log; the RTMR3 "compose-hash" event equals
//     sha256(app_compose), so the measured container set is the published docker compose (images pinned by digest).
//  4. The GPU evidence carries the same nonce; `nras` (optional, network) submits it to the GPU vendor's attestation
//     service and reads the overall verdict.
// Not checked here: TCB level / revocation collateral (the official verifier's dcap-qvl does that) — reported as such.
import { createHash, createPublicKey, verify as cryptoVerify, X509Certificate } from 'node:crypto';

/** SHA-256 fingerprint of the Intel SGX Root CA (certificates.trustedservices.intel.com/Intel_SGX_Provisioning_Certification_RootCA.cer). */
export const INTEL_ROOT_FP256 = '44:A0:19:6B:2B:99:F8:89:B8:E1:49:E9:5B:80:7A:35:0E:74:24:96:43:99:E8:85:A7:CB:B8:CC:FA:B6:74:D3';
export const NRAS_URL = 'https://nras.attestation.nvidia.com/v3/attest/gpu';

const HEADER = 48, BODY = 584;
const sha = (alg, b) => createHash(alg).update(b).digest();

/** Parses and cryptographically checks a TDX v4 quote (hex). Returns {ok, reason?, reportData, rtmrs, mrtd, chain}. */
export function verifyTdxQuote(quoteHex) {
  let q;
  try { q = Buffer.from(String(quoteHex), 'hex'); } catch { return { ok: false, reason: 'bad_hex' }; }
  if (q.length < HEADER + BODY + 4 || q.readUInt16LE(0) !== 4 || q.readUInt32LE(4) !== 0x81) return { ok: false, reason: 'not_tdx_v4' };
  const body = HEADER;
  const out = {
    ok: false,
    mrtd: q.subarray(body + 136, body + 184).toString('hex'),
    rtmrs: [0, 1, 2, 3].map((i) => q.subarray(body + 328 + 48 * i, body + 376 + 48 * i).toString('hex')),
    reportData: q.subarray(body + 520, body + 584).toString('hex'),
  };
  try {
    let o = HEADER + BODY + 4;
    const sig = q.subarray(o, o + 64); o += 64;
    const ak = q.subarray(o, o + 64); o += 64;
    if (q.readUInt16LE(o) !== 6) return { ...out, reason: 'no_qe_report' };
    o += 6;
    const qe = q.subarray(o, o + 384), qeSig = q.subarray(o + 384, o + 448); o += 448;
    const authLen = q.readUInt16LE(o); const auth = q.subarray(o + 2, o + 2 + authLen); o += 2 + authLen;
    if (q.readUInt16LE(o) !== 5) return { ...out, reason: 'no_pck_chain' };
    const pem = q.subarray(o + 6, o + 6 + q.readUInt32LE(o + 2)).toString();
    const certs = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map((x) => new X509Certificate(x));
    if (certs.length < 3) return { ...out, reason: 'short_chain' };
    const attKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: ak.subarray(0, 32).toString('base64url'), y: ak.subarray(32).toString('base64url') }, format: 'jwk' });
    if (!cryptoVerify('sha256', q.subarray(0, HEADER + BODY), { key: attKey, dsaEncoding: 'ieee-p1363' }, sig)) return { ...out, reason: 'quote_signature' };
    if (!cryptoVerify('sha256', qe, { key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' }, qeSig)) return { ...out, reason: 'qe_signature' };
    if (!sha('sha256', Buffer.concat([ak, auth])).equals(qe.subarray(320, 352))) return { ...out, reason: 'qe_binding' };
    for (let i = 0; i < certs.length - 1; i++) if (!certs[i].verify(certs[i + 1].publicKey)) return { ...out, reason: 'chain' };
    const root = certs[certs.length - 1];
    if (!root.verify(root.publicKey) || root.fingerprint256 !== INTEL_ROOT_FP256) return { ...out, reason: 'root_not_intel' };
    const now = Date.now();
    if (certs.some((c) => Date.parse(c.validTo) < now || Date.parse(c.validFrom) > now)) return { ...out, reason: 'cert_expired' };
    return { ...out, ok: true, chain: certs.map((c) => (c.subject.split('\n').find((l) => l.startsWith('CN=')) || '').slice(3)) };
  } catch (e) { return { ...out, reason: 'parse:' + String((e && e.message) || e).slice(0, 40) }; }
}

/** report_data must be the signing address left-aligned in 32 bytes, then the 32-byte nonce. */
export function reportDataBinds(reportDataHex, signingAddress, nonceHex) {
  const rd = String(reportDataHex).toLowerCase(), addr = String(signingAddress).toLowerCase().replace(/^0x/, '');
  const first = rd.slice(0, 64), second = rd.slice(64, 128);
  return { address: /^[0-9a-f]{40}$/.test(addr) && first === addr.padEnd(64, '0'), nonce: nonceHex == null ? null : second === String(nonceHex).toLowerCase() };
}

/** Replays RTMR0-3 from a dstack event log (sha384 extend) and returns the four hex values. */
export function replayRtmrs(eventLog) {
  const r = [0, 1, 2, 3].map(() => Buffer.alloc(48));
  for (const e of eventLog || []) {
    if (!(e.imr >= 0 && e.imr <= 3)) continue;
    let d = Buffer.from(e.digest || '', 'hex'); if (d.length < 48) d = Buffer.concat([d, Buffer.alloc(48 - d.length)]);
    r[e.imr] = sha('sha384', Buffer.concat([r[e.imr], d]));
  }
  return r.map((b) => b.toString('hex'));
}

const asObj = (x) => { if (typeof x !== 'string') return x || {}; try { return JSON.parse(x); } catch { return {}; } };

/**
 * Checks one model attestation (an entry of `model_attestations`) for `signingAddress` and `nonce`.
 * Returns {pass, checks: {name: true|false|null}, summary} — null means not checked.
 */
export async function verifyModelAttestation(att, { signingAddress, nonce = null, nras = false, fetch = globalThis.fetch } = {}) {
  const checks = {};
  const addr = String(signingAddress || att.signing_address || '').toLowerCase();
  checks.address_matches = String(att.signing_address || '').toLowerCase() === addr;
  const quote = verifyTdxQuote(att.intel_quote);
  checks.tdx_quote = quote.ok;
  const binds = reportDataBinds(quote.reportData || '', addr, nonce);
  checks.report_data_binds_address = binds.address;
  checks.report_data_binds_nonce = binds.nonce;
  const info = asObj(att.info), tcb = asObj(info.tcb_info);
  const log = asObj(tcb.event_log);
  const replay = replayRtmrs(Array.isArray(log) ? log : []);
  checks.rtmrs_replay = !!quote.rtmrs && replay.every((h, i) => h === quote.rtmrs[i]);
  const composeHash = tcb.app_compose ? createHash('sha256').update(tcb.app_compose).digest('hex') : null;
  const ev = Array.isArray(log) ? log.find((e) => e.event === 'compose-hash' && e.imr === 3) : null;
  checks.compose_hash_measured = !!composeHash && composeHash === tcb.compose_hash && !!ev && ev.event_payload === composeHash;
  let gpu = null;
  try { gpu = att.nvidia_payload ? JSON.parse(att.nvidia_payload) : null; } catch { gpu = null; }
  checks.gpu_nonce = gpu && nonce != null ? String(gpu.nonce).toLowerCase() === String(nonce).toLowerCase() : null;
  checks.gpu_verdict = null;
  if (nras && gpu) {
    try {
      const r = await fetch(NRAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gpu) });
      const body = await r.json();
      const jwt = Array.isArray(body) && body[0] && body[0][1];
      const claims = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString());
      checks.gpu_verdict = claims['x-nvidia-overall-att-result'] === true;
    } catch { checks.gpu_verdict = false; }
  }
  const pass = Object.values(checks).every((v) => v !== false);
  const images = [...String(asObj(tcb.app_compose).docker_compose_file || '').matchAll(/image:\s*(\S+)/g)].map((m) => m[1]);
  return {
    pass, checks, quoteReason: quote.reason || null,
    summary: {
      signing_address: addr, model: att.model_name || null, app_name: info.app_name || null, compose_hash: tcb.compose_hash || null,
      os_image_hash: tcb.os_image_hash || info.os_image_hash || null, mrtd: quote.mrtd || null, gpu_arch: gpu ? gpu.arch || null : null,
      gpu_count: gpu && Array.isArray(gpu.evidence_list) ? gpu.evidence_list.length : 0, pck_chain: quote.chain || null, images: images.slice(0, 12),
    },
  };
}
