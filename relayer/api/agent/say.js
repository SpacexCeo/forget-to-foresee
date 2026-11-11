// POST /api/agent/say {npc, question, facts?, lang?} -> {text, tee: {chat_id, signature, signing_address, attestation, ...}}
import { teeHandler } from '../../lib/tee-http.js';
export default teeHandler('say');
