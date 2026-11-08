// Panel exclusivity for the play layer (owner feedback 08.11: panels stacked on top of each other and
// the Shell dock overlapped them). One arbiter per UI root decides which modal surface is open: the
// play panels (memories, signs detail, ask, dialogue, info, end), the play help, the world HUD's
// Signs & Visions panel and the hub's decision card. Opening one closes the others; while any of
// them is open the hub dock and reading card stay hidden (body class `pl-modal-open`, read by CSS).
// Pure logic: no DOM here except the optional class toggle the host passes in, so it is node-tested.

const ARBITERS = new WeakMap();

/** @typedef {{ id: string, close: () => void, modal: boolean }} Claim */

/**
 * @param {{onChange?: (current: string|null, modal: boolean) => void}} [o]
 *   `modal` is true while the open surface should hide the hub dock and reading card (every surface
 *   except the desktop Signs panel, which reads alongside the dock and leaves its area free).
 */
export function createPanelArbiter(o = {}) {
  /** @type {Claim|null} */
  let current = null;
  const subs = new Set();
  const notify = () => { const id = current ? current.id : null, modal = !!(current && current.modal); if (o.onChange) o.onChange(id, modal); for (const fn of [...subs]) fn(id, modal); };

  const api = {
    /** The id of the open modal surface, or null. */
    get current() { return current ? current.id : null; },
    isOpen: (id) => !!current && current.id === id,
    /** True while a modal surface is open (the hub dock and reading card hide). */
    get modal() { return !!(current && current.modal); },
    /**
     * Opens `id`: whatever else is open gets its close() called first (it must call release(), which
     * is a no-op once another claim replaced it). Returns true when the claim changed anything.
     * @param {string} id @param {() => void} close @param {{modal?: boolean}} [opts]
     */
    claim(id, close, opts = {}) {
      const modal = opts.modal !== false;
      if (current && current.id === id) { const changed = current.modal !== modal; current.close = close; current.modal = modal; if (changed) notify(); return changed; }
      const prev = current;
      current = { id, close, modal };
      if (prev) { try { prev.close(); } catch (e) { console.warn('[panels] close failed', prev.id, e); } }
      notify();
      return true;
    },
    /** Marks `id` closed (only if it still holds the claim). */
    release(id) {
      if (!current || current.id !== id) return false;
      current = null;
      notify();
      return true;
    },
    /** Closes whatever is open. */
    closeAll() {
      if (!current) return false;
      const c = current;
      current = null;
      try { c.close(); } catch (e) { console.warn('[panels] close failed', c.id, e); }
      notify();
      return true;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}

/**
 * The shared arbiter of a UI root (the play UI, the world HUD and the hub UI all mount on the same
 * root but are created separately). The first caller creates it; the body class follows its state.
 * @param {object} root  the overlay root element (or any object in tests)
 */
export function panelArbiterFor(root) {
  let a = ARBITERS.get(root);
  if (!a) {
    const doc = root && root.ownerDocument;
    a = createPanelArbiter({ onChange: doc && doc.body ? (id, modal) => doc.body.classList.toggle('pl-modal-open', modal) : undefined });
    ARBITERS.set(root, a);
  }
  return a;
}
