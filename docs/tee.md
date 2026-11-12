# TEE agents: verifiable AI townsfolk and traders

Some townsfolk lines and a hired trader's buy/sell/hold come from a language model that runs inside a trusted
execution environment (Intel TDX confidential VM with confidential-computing GPUs) on **NEAR AI Cloud**. Each answer
carries a signature made inside the TEE and the hardware attestation of the signing key, so anyone can check that the
answer came unmodified from that model in that enclave. When the TEE path is unavailable the game uses its scripted
lines, and says so.

## Primary sources

- NEAR AI Cloud docs: https://docs.near.ai/cloud/ (private inference, verification)
- API base (OpenAI-compatible): `https://cloud-api.near.ai/v1`
- Verifier reference implementation: https://github.com/nearai/nearai-cloud-verifier (`py/chat_verifier.py`,
  `py/model_verifier.py`)
- Example app: https://github.com/near-examples/nearai-cloud-verification-example
- Intel SGX/TDX root CA: https://certificates.trustedservices.intel.com/Intel_SGX_Provisioning_Certification_RootCA.cer
- GPU attestation service (NRAS): `https://nras.attestation.nvidia.com/v3/attest/gpu`

## Endpoints used (checked 2026-11-11)

| Call | Purpose |
|---|---|
| `GET /v1/models` | model list; `owned_by: "nearai"` models are served from NEAR AI's own attested hosts |
| `POST /v1/chat/completions` | the answer (`id` is the chat id). Needs the API key and account credits |
| `GET /v1/signature/{chat_id}?model=<id>&signing_algo=ecdsa` | `{text, signature, signing_address, signing_algo}`; `text` is `sha256(request body):sha256(response body)` (some models prefix `model:`) |
| `GET /v1/attestation/report?model=<id>&signing_algo=ecdsa&nonce=<64 hex>&signing_address=<0x…>` | `gateway_attestation` and `model_attestations[]`, each with `intel_quote`, `nvidia_payload`, `info.tcb_info` (event log, `app_compose`) |

Default model: `Qwen/Qwen3-VL-30B-A3B-Instruct` (instruction model, no reasoning block, cheap); override with
`NEARAI_MODEL`.

## The verification chain

1. **Hashes.** sha256 of the exact request body and of the exact response body equal the two hashes in `text`.
2. **Signature.** `signature` is an EIP-191 `personal_sign` over `text`; secp256k1 recovery gives `signing_address`.
3. **Attestation of that address**, fetched with our own fresh nonce:
   - the Intel TDX quote (v4) is genuine: the quote's ECDSA-P256 signature with the attestation key, the QE report
     signed by the PCK certificate, the QE report binding the attestation key, and the PCK chain up to the Intel SGX
     Root CA (pinned SHA-256 fingerprint `44:A0:19:6B:…:74:D3`);
   - `report_data` = signing address (left-aligned in 32 bytes) ‖ our nonce, so the key was made inside this VM now;
   - RTMR0–3 in the quote equal a replay of `tcb_info.event_log`, and the RTMR3 `compose-hash` event equals
     sha256(`app_compose`): the running containers are the published docker compose, images pinned by digest;
   - the GPU evidence carries our nonce, and the GPU vendor's attestation service returns an overall PASS.
4. **Not checked by our tool:** the Intel TCB level and revocation collateral. The reference verifier does this with
   `dcap-qvl`; run it for the full picture (`python3 py/model_verifier.py --model <id>`).

## In this repository

- `relayer/lib/tee.js`, `relayer/lib/tee-http.js`: `POST /api/agent/say` and `POST /api/agent/decide`; the key stays on
  the server (`NEARAI_API_KEY`). Each answer returns `tee: {request_body, response_body, signed_text, signature,
  signing_address, signature_check, attestation, verified}`. API in `relayer/README.md`.
- `relayer/lib/tee-crypto.js`: keccak256, EIP-191 hash and secp256k1 recovery, no dependencies (also copied to the
  game so the browser re-checks the signature itself).
- `relayer/lib/tee-attest.js`: the quote / report-data / RTMR / compose / GPU checks with Node's own crypto.
- `tools/verify-tee/verify.mjs`: the independent checker, prints PASS / FAIL.

```bash
node tools/verify-tee/verify.mjs --model Qwen/Qwen3-VL-30B-A3B-Instruct   # is the model's signer in a real TEE?
node tools/verify-tee/verify.mjs answer.json                              # a saved relayer answer (the game's panel copies it)
```

On-chain check of the ledger's signature test (2026-11-11, redeployed `ledger.ftf-coordinator.testnet`): a fixture
decision signed by a test key was accepted (tx `CXwygVCaDuowUCLU5NtMZcgB2wkKfB5Bb9LJtMFZo4A2`) and the same decision
with another signing address was rejected with `ERR_TEE_SIG` (tx `WMLuf9cSmJVDsnyZzvUWNTAGf8V3abQjnuMCHessNhc`).
The test record's model reads `fixture-test-key-not-a-tee`.

Recorded run of the first command (2026-11-11, live): every check ok, including the GPU vendor verdict, 8 Hopper
GPUs, PASS.

## Honest limits

- The TEE proves *which model in which enclave* produced the text from *which request*. It does not prove the prompt
  is fair: the prompts are in `relayer/lib/tee.js` and are part of the signed request body, so anyone can read them.
- The relayer that calls NEAR AI Cloud is an ordinary server; it cannot forge an answer (the signature would fail),
  but it could choose not to forward one. Moving the relayer itself into a TEE (Shade Agent) is a later step.
- A trader's TEE decision is advisory. The hired traders' trades stay the deterministic, re-computable policy
  (`docs/agent-track-record-plan.md`), so the recorded track records keep verifying by replay.

## Next step (plan only, not built): the relayer itself as a Shade Agent

Today the model runs in a TEE, but the relayer that builds the prompt and forwards the answer is an ordinary server.
It cannot forge an answer, yet it could drop one or send a prompt other than the published code. A Shade Agent
closes that gap (docs: https://docs.near.org/ai/shade-agents/getting-started/introduction).

1. **Package.** Build `relayer/` as a reproducible Docker image (pinned base image by digest, `npm test` in the build);
   publish it with its sha256 digest.
2. **Run in a TEE.** Deploy that image to a dstack-based confidential VM host (needs an account there, owner action).
   The VM's TDX quote measures the compose file, so the image digest is attested exactly like NEAR AI Cloud's here.
3. **Agent contract on NEAR testnet** (`tee-agent.ftf-coordinator.testnet`): the owner approves one image codehash;
   the agent calls `register_agent(quote, collateral, checksum, tcb_info)` and the contract verifies the quote and that
   its compose hash pins the approved codehash, then stores the agent's account. Only a registered agent may call
   `request_signature` (chain signatures) or, for us, write TEE decisions to the ledger.
4. **Ledger change.** `record_tee_decision` gains a variant callable only by the registered agent account, so a record
   proves both ends ran attested code: the relayer (by registration) and the model (by the NEAR AI Cloud signature).
5. **Keys.** The NEAR AI Cloud key and the mint key move into the TEE's sealed environment; the operator no longer
   holds them in a plain `.env`.
6. **Verifier.** `tools/verify-tee` adds: read the approved codehash from the agent contract, check the registered
   agent matches, and rebuild the image locally to compare digests.

Cost and risk: one extra deploy target and an approval flow for every relayer release; the game keeps working through
the current relayer as a fallback. Needs from the owner: an account with the confidential VM host.
