// Chat over the head (owner 13.11: "the chat message above the head"): each new chat line of the shared town shows as a
// small bubble over its speaker, the player's own over her own heroine, for a few seconds. One bubble per speaker (the
// newest line wins); hidden beyond BUBBLE.range metres or behind the camera. Pure queue + a DOM overlay projected with
// the game camera; nothing here touches the chat itself (ui/chat-panel.js keeps the log).

export const BUBBLE = Object.freeze({ seconds: 6, range: 35, head: 2.05, maxChars: 90 });
export const SELF = 'self';

/** The bubble queue (pure): push(key, text, at) keeps the newest line per speaker; live(at) lists the unexpired ones. */
export function createBubbleQueue({ seconds = BUBBLE.seconds, maxChars = BUBBLE.maxChars } = {}) {
  const m = new Map(); // key -> {key, text, until}
  return {
    push(key, text, at) {
      let s = String(text || '').replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (s.length > maxChars) s = s.slice(0, maxChars - 1) + '…';
      m.set(key, { key, text: s, until: at + seconds });
    },
    live(at) { for (const [k, b] of m) if (b.until <= at) m.delete(k); return [...m.values()]; },
  };
}

/**
 * New lines of a presence chat array since the last call: the speaker key is SELF for the player's own lines. Only
 * live speech becomes a bubble: the room's remembered lines (`old`) and the action feed (`act`) stay in the panel.
 */
export function chatFeed() {
  let seen = 0, lastRef = null;
  return (chat) => {
    if (!chat) return [];
    // the presence keeps the last 60 lines and shifts the oldest: follow the last line we saw
    let start = 0;
    if (lastRef) { const i = chat.lastIndexOf(lastRef); start = i >= 0 ? i + 1 : Math.max(0, chat.length - 1); } else start = seen ? 0 : chat.length; // the first call only marks where we are
    const out = chat.slice(start).filter((c) => !c.old && !c.act).map((c) => ({ key: c.mine ? SELF : c.id, text: c.text }));
    if (chat.length) lastRef = chat[chat.length - 1];
    seen = 1;
    return out;
  };
}

const CSS = `
.ftf-say { position: fixed; left: 0; top: 0; z-index: 12; pointer-events: none; max-width: 240px; padding: 6px 10px; border-radius: 12px;
  background: rgba(16, 22, 24, .86); color: #f3ead8; font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
  border: 1px solid rgba(233, 180, 76, .45); transform: translate(-50%, -100%); white-space: normal; word-break: break-word; text-align: center; }
.ftf-say::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: rgba(16, 22, 24, .86); }
`;

/**
 * The overlay. update(at, heads) with heads = Map key -> world [x, y, z] of the speaker's feet (SELF for the player).
 * @param {{doc?: Document, camera: object, THREE: object}} o
 */
export function createChatBubbles({ doc = globalThis.document, camera, THREE }) {
  if (!doc.getElementById('ftf-say-css')) { const s = doc.createElement('style'); s.id = 'ftf-say-css'; s.textContent = CSS; doc.head.append(s); }
  const q = createBubbleQueue();
  const els = new Map();
  const v = new THREE.Vector3(), cam = new THREE.Vector3();
  return {
    push: (key, text, at) => q.push(key, text, at),
    update(at, heads) {
      const live = q.live(at), keep = new Set();
      camera.getWorldPosition(cam);
      for (const b of live) {
        const p = heads.get(b.key);
        if (!p) continue;
        v.set(p[0], p[1] + BUBBLE.head, p[2]);
        if (v.distanceTo(cam) > BUBBLE.range) continue;
        v.project(camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
        let el = els.get(b.key);
        if (!el) { el = doc.createElement('div'); el.className = 'ftf-say'; doc.body.append(el); els.set(b.key, el); }
        if (el.textContent !== b.text) el.textContent = b.text;
        el.style.left = ((v.x + 1) / 2 * innerWidth).toFixed(1) + 'px';
        el.style.top = ((1 - v.y) / 2 * innerHeight).toFixed(1) + 'px';
        keep.add(b.key);
      }
      for (const [k, el] of els) if (!keep.has(k)) { el.remove(); els.delete(k); }
    },
    clear() { for (const el of els.values()) el.remove(); els.clear(); },
  };
}
