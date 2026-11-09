// The agent card (DOM): Iris's end-of-season NFT card, drawn from the model of src/net/agent-nft.js (loadAgentCard).
// This file only draws: the state pill says exactly what was verified ('minted' = on-chain, hash and root checked and
// equal to this browser's own season; 'not-minted' = a preview of what would be minted; 'offline' = nothing verified;
// 'mismatch' = a token exists but a check failed, and why). Strings: `agentcard.*` in the five play locales, plus the
// existing `agent.*`, `vision.rule.*`, `outcome.*` and `shard.nft.kind.*`.
// Not wired into the end panel here (src/play/ui.js); the host appends `renderAgentCard(model, {t})` where it fits.
import { ensureWhStyle } from './index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null) e.append(c);
  return e;
}

const link = (doc, href, text, cls) => (href
  ? el(doc, 'a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer', text })
  : el(doc, 'span', { class: cls, text }));

export function ensureAgentCardStyle(doc = document) {
  ensureWhStyle('shard-card', new URL('./shard-card.css', import.meta.url).href, doc);
  ensureWhStyle('agent-card', new URL('./agent-card.css', import.meta.url).href, doc);
}

const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '');
const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));

/** The card image: the SVG parsed inline when a DOMParser exists, else an <img> of the same bytes. */
function cardImage(doc, model) {
  const box = el(doc, 'div', { class: 'ag-ink' });
  if (!model.svg) return box;
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(model.svg, 'image/svg+xml').documentElement;
    if (parsed && parsed.namespaceURI === SVG_NS) {
      const svg = doc.importNode(parsed, true);
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', model.tokenId);
      box.append(svg);
      return box;
    }
  }
  box.append(el(doc, 'img', { src: `data:image/svg+xml;base64,${b64(model.svg)}`, alt: model.tokenId, width: 160, height: 210 }));
  return box;
}

/** The pill: what was verified, in one phrase. */
export function agentCardStatusKey(model) {
  if (!model) return null;
  if (model.state === 'minted') return 'agentcard.state.minted';
  if (model.state === 'offline') return 'agentcard.state.offline';
  if (model.state === 'mismatch') return model.reason === 'playthrough' ? 'agentcard.state.recorded' : 'agentcard.state.mismatch';
  return model.judgeOnly ? 'agentcard.state.judgeOnly' : 'agentcard.state.notMinted';
}

/** The plain-text lines of the card (the DOM draws these; tests read them without a DOM). */
export function agentCardLines(model, t) {
  if (!model || !model.traits) return null;
  const tr = model.traits, bio = model.biography;
  const clan = (c) => t('agent.' + c);
  const kind = (k) => t('shard.nft.kind.' + k);
  const top = tr.trust.length ? tr.trust.reduce((a, b) => (b.trust > a.trust ? b : a)) : null;
  const broken = tr.trust.filter((e) => e.link_broken).map((e) => clan(e.clan));
  const memory = (m) => (m.about ? t('agentcard.memoryAbout', { kind: kind(m.kind), clan: clan(m.about), weight: m.weight }) : t('agentcard.memory', { kind: kind(m.kind), weight: m.weight }));
  const fate = (m) => (m.fate === 'bought' ? t('agentcard.fate.bought', { clan: clan(m.buyer), price: m.price }) : t('agentcard.fate.' + m.fate));
  const heir = model.heir === null ? 'agentcard.heir.none' : model.heir ? 'agentcard.heir.yes' : 'agentcard.heir.no';
  return {
    title: t('agentcard.title', { agent: clan(model.agent) }),
    status: t(agentCardStatusKey(model)),
    reason: model.state === 'mismatch' ? t('agentcard.reason.' + model.reason) : model.state === 'not-minted' && !model.judgeOnly ? t('agentcard.preview') : null,
    traits: [
      t('agentcard.rule', { rule: t('vision.rule.' + tr.reading_rule) }),
      t('agentcard.words', { known: tr.words_known, confident: tr.confident_cells }),
      t(tr.wild ? 'agentcard.wild' : 'agentcard.obedient', { attention: tr.attention }),
      t('agentcard.silk', { silk: tr.silk }),
      top ? t('agentcard.trust', { clan: clan(top.clan), trust: top.trust }) : null,
      broken.length ? t('agentcard.broken', { clans: broken.join(', ') }) : null,
    ].filter(Boolean),
    remembered: bio.remembered.length ? bio.remembered.map(memory) : [t('agentcard.none')],
    forgotten: bio.forgotten.length ? bio.forgotten.map((m) => ({ text: `${memory(m)}: ${fate(m)}`, shard: m.shard_token, href: m.shardHref, minted: m.shardMinted })) : [],
    outcome: t('agentcard.outcome', { outcome: t('outcome.' + model.outcome), tick: model.finalTick }),
    heir: t(heir),
    scope: t('agentcard.scope'),
  };
}

/**
 * The card: image, NFT line, status pill (+ reason), token/owner/hash/root facts, traits, biography (remembered,
 * forgotten with fate and the shard link), outcome, links, and the scope line. Returns null for a null model.
 * @param {object|null} model  loadAgentCard() result
 * @param {{t: (key: string, args?: object) => string, doc?: Document}} o
 */
export function renderAgentCard(model, { t, doc = document } = {}) {
  if (!model) return null;
  ensureAgentCardStyle(doc);
  const lines = agentCardLines(model, t);
  const verified = model.state === 'minted' || (model.state === 'mismatch' && model.reason === 'playthrough');
  const facts = el(doc, 'dl', { class: 'sh-facts' },
    el(doc, 'dt', { text: t('agentcard.token') }), el(doc, 'dd', { class: 'sh-mono', text: model.tokenId }),
    model.owner ? [el(doc, 'dt', { text: t('agentcard.owner') }), el(doc, 'dd', {}, link(doc, model.ownerHref, model.owner, 'sh-mono'))] : null,
    model.stateHash || model.localHash ? [el(doc, 'dt', { text: t('agentcard.stateHash') }), el(doc, 'dd', { class: 'sh-mono', title: model.stateHash || model.localHash, text: short(model.stateHash || model.localHash) })] : null,
    model.state === 'mismatch' && model.reason === 'playthrough' && model.localHash ? [el(doc, 'dt', { text: t('agentcard.yourHash') }), el(doc, 'dd', { class: 'sh-mono', title: model.localHash, text: short(model.localHash) })] : null,
    model.committedRoot && model.reason !== 'root' ? [el(doc, 'dt', { text: t('agentcard.root') }), el(doc, 'dd', {}, link(doc, model.links.seasonCommit, t('agentcard.rootOk'), 'ag-link'))] : null);
  const node = el(doc, 'article', { class: 'ag-card', 'data-token': model.tokenId, 'data-state': model.state },
    cardImage(doc, model),
    el(doc, 'div', { class: 'ag-body' },
      el(doc, 'p', { class: 'sh-kicker', text: `NFT · ${model.standard || 'NEP-171'} · ${model.contractId || ''}` }),
      el(doc, 'h4', { class: 'sh-title', text: lines ? lines.title : t('agentcard.title', { agent: t('agent.' + model.agent) }) }),
      el(doc, 'p', { class: `ag-pill ag-pill--${model.state}${verified ? ' ag-pill--ok' : ''}`, text: t(agentCardStatusKey(model)) }),
      lines && lines.reason ? el(doc, 'p', { class: 'ag-reason', text: lines.reason }) : null,
      facts,
      lines ? [
        el(doc, 'ul', { class: 'ag-traits' }, lines.traits.map((x) => el(doc, 'li', { text: x }))),
        el(doc, 'h5', { class: 'ag-h', text: t('agentcard.remembered') }),
        el(doc, 'ul', { class: 'ag-list' }, lines.remembered.map((x) => el(doc, 'li', { text: x }))),
        lines.forgotten.length ? [
          el(doc, 'h5', { class: 'ag-h', text: t('agentcard.forgotten') }),
          el(doc, 'ul', { class: 'ag-list' }, lines.forgotten.map((f) => el(doc, 'li', {}, f.text, ' · ', link(doc, f.minted ? f.href : null, t('agentcard.shard', { token: f.shard }), 'ag-link sh-mono')))),
        ] : null,
        el(doc, 'p', { class: 'ag-outcome', text: `${lines.outcome} · ${lines.heir}` }),
      ] : null,
      el(doc, 'p', { class: 'sh-links' },
        model.state === 'minted' || model.state === 'mismatch' ? link(doc, model.links.token, t('agentcard.view'), 'sh-btn') : null,
        model.svgVerified ? el(doc, 'span', { class: 'sh-verified', text: t('agentcard.imageVerified') }) : null),
      el(doc, 'p', { class: 'ag-scope', text: t('agentcard.scope') })));
  return node;
}
