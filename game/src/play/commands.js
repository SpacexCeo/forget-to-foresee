// Input → command layer. Every player decision becomes one room command envelope
// {actionId, expectedVersion, type, args} (docs/api/README.md). The bus:
//   - serializes commands (one in flight at a time, in the order the player made them);
//   - carries an idempotency key per decision: a key is minted when an option is offered, so a
//     double click or a key-repeat replays the stored result instead of paying twice;
//   - tracks the session version from every result and observation; a stale version (409) re-reads
//     the observation and retries the SAME key once (nothing was applied the first time);
//   - waits for a `move` replay to arrive before the next command (proximity preconditions);
//   - reports every result to listeners (HUD rejections, hooks), never interpreting rules itself.

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const rand = () => {
  try { return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join(''); }
  catch { return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'); }
};
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CommandBus {
  /**
   * @param {ReturnType<import('./transport-local.js').createLocalTransport>} transport
   * @param {{sleep?: (ms:number) => Promise<void>, prefix?: string}} [o]
   */
  constructor(transport, { sleep = defaultSleep, prefix } = {}) {
    this.transport = transport;
    this.sleep = sleep;
    this.prefix = prefix || 'ui-' + rand();
    this.seq = 0;
    this.version = null;
    this.chain = Promise.resolve();
    this.listeners = new Set();
    this.pending = 0;
    this.sent = 0; this.replays = 0; this.rejections = 0; this.conflicts = 0;
  }

  /** A fresh idempotency key for one player decision. */
  key(type = 'cmd') { return `${this.prefix}.${++this.seq}.${String(type).replace(/[^A-Za-z0-9_]/g, '')}`.slice(0, 128); }

  onResult(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Re-reads the observation (and the version) through the transport. */
  async observe() {
    const r = await this.transport.observe();
    if (r.status === 200) this.version = r.body.observation.version;
    return r.status === 200 ? r.body.observation : null;
  }

  /**
   * Queues one command. Resolves to {ok, status, type, args, actionId, body, reason, replayed}.
   * @param {string} type @param {object} [args] @param {{key?: string, silent?: boolean}} [o]
   */
  send(type, args = {}, { key, silent = false } = {}) {
    const actionId = key && KEY_RE.test(key) ? key : this.key(type);
    this.pending++;
    const run = async () => {
      try { return await this.dispatch(type, args, actionId, silent); }
      finally { this.pending--; }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  async dispatch(type, args, actionId, silent) {
    if (this.version == null) await this.observe();
    let r = await this.transport.command({ actionId, expectedVersion: this.version, type, args });
    if (r.status === 409 && r.body.error && r.body.error.code === 'version_conflict') {
      this.conflicts++;
      this.version = r.body.error.currentVersion ?? (await this.observe(), this.version);
      r = await this.transport.command({ actionId, expectedVersion: this.version, type, args });
    }
    this.sent++;
    const body = r.body || {};
    if (Number.isInteger(body.version)) this.version = body.version;
    if (body.replayed) this.replays++;
    const ok = r.status === 200 && body.ok === true;
    const reason = ok ? null : (body.error && (body.error.reason || body.error.code)) || 'rejected';
    if (!ok) this.rejections++;
    const out = { ok, status: r.status, type, args, actionId, body, reason, replayed: !!body.replayed, source: body.error ? body.error.source || null : null, silent };
    // A walk replay must arrive before the next command is processed (proximity, not_in_transit).
    // A timer may fire before the room's clock has moved that far (Node schedules from the loop's cached time, so after
    // a long synchronous turn it fires early by that turn's length): wait on the room's own clock, not on the timer.
    if (ok && type === 'move' && body.result && body.result.seconds > 0 && this.transport.realDelayMs) {
      const ms = this.transport.realDelayMs(body.result.seconds) + 2, now = this.transport.now || Date.now, until = now() + ms;
      await this.sleep(ms);
      for (let i = 0; i < 100 && now() < until; i++) await this.sleep(Math.max(1, Math.ceil(until - now())));
    }
    for (const fn of [...this.listeners]) { try { fn(out); } catch (e) { console.warn('[play] result listener failed', e); } }
    return out;
  }

  /** Resolves when every queued command has finished. */
  idle() { return this.chain; }

  stats() { return { version: this.version, sent: this.sent, replays: this.replays, rejections: this.rejections, conflicts: this.conflicts, pending: this.pending }; }
}
