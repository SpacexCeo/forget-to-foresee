// A small, dependency-free subset of ICU MessageFormat.
// Supported: {name}, {name, number}, {name, number, integer|percent},
// {name, plural, =0 {…} one {…} few {…} many {…} other {…}} with `#`,
// {name, selectordinal, …}, {name, select, a {…} other {…}}.
// Apostrophes follow ICU's "optional" rule: a single ' is literal unless it
// precedes { } # | or another ', so "Iris's" needs no escaping.
// Plural categories come from Intl.PluralRules, numbers from Intl.NumberFormat.

const cache = new Map();

export class IcuSyntaxError extends Error {}

/** Parses a message into an AST (cached). Throws IcuSyntaxError on bad syntax. */
export function parse(message) {
  let ast = cache.get(message);
  if (!ast) {
    const p = { s: message, i: 0 };
    ast = parseNodes(p, false, false);
    if (p.i < p.s.length) throw new IcuSyntaxError(`unexpected "${p.s[p.i]}" at ${p.i} in: ${message}`);
    cache.set(message, ast);
  }
  return ast;
}

function parseNodes(p, inPlural, nested) {
  const out = [];
  let text = '';
  const flush = () => { if (text) { out.push(text); text = ''; } };
  while (p.i < p.s.length) {
    const c = p.s[p.i];
    if (c === "'") {
      const n = p.s[p.i + 1];
      if (n === "'") { text += "'"; p.i += 2; continue; }
      if (n === '{' || n === '}' || n === '#' || n === '|') {
        // Quoted literal until the next lone apostrophe.
        p.i++;
        while (p.i < p.s.length) {
          if (p.s[p.i] === "'") {
            if (p.s[p.i + 1] === "'") { text += "'"; p.i += 2; continue; }
            p.i++; break;
          }
          text += p.s[p.i++];
        }
        continue;
      }
      text += c; p.i++; continue;
    }
    if (c === '{') { flush(); out.push(parseArg(p)); continue; }
    if (c === '}') { if (!nested) throw new IcuSyntaxError(`unbalanced "}" at ${p.i} in: ${p.s}`); break; }
    if (c === '#' && inPlural) { flush(); out.push({ type: 'pound' }); p.i++; continue; }
    text += c; p.i++;
  }
  flush();
  return out;
}

const isSpace = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
const ws = (p) => { while (p.i < p.s.length && isSpace(p.s[p.i])) p.i++; };
function word(p) {
  ws(p);
  const start = p.i;
  while (p.i < p.s.length && !isSpace(p.s[p.i]) && p.s[p.i] !== '{' && p.s[p.i] !== '}' && p.s[p.i] !== ',') p.i++;
  if (p.i === start) throw new IcuSyntaxError(`expected identifier at ${p.i} in: ${p.s}`);
  const w = p.s.slice(start, p.i);
  ws(p);
  return w;
}
function expect(p, ch) {
  ws(p);
  if (p.s[p.i] !== ch) throw new IcuSyntaxError(`expected "${ch}" at ${p.i} in: ${p.s}`);
  p.i++;
}

function parseArg(p) {
  expect(p, '{');
  const name = word(p);
  if (p.s[p.i] === '}') { p.i++; return { type: 'arg', name }; }
  expect(p, ',');
  const kind = word(p);
  if (kind === 'number') {
    let style = null;
    if (p.s[p.i] === ',') { p.i++; style = word(p); }
    expect(p, '}');
    return { type: 'number', name, style };
  }
  if (kind !== 'plural' && kind !== 'select' && kind !== 'selectordinal') throw new IcuSyntaxError(`unknown argument type "${kind}" in: ${p.s}`);
  expect(p, ',');
  const options = {};
  let offset = 0;
  ws(p);
  while (p.s[p.i] !== '}') {
    if (p.i >= p.s.length) throw new IcuSyntaxError(`unterminated ${kind} in: ${p.s}`);
    const key = word(p);
    if (key.startsWith('offset:')) { offset = Number(key.slice(7)); continue; }
    expect(p, '{');
    options[key] = parseNodes(p, kind !== 'select', true);
    expect(p, '}');
    ws(p);
  }
  p.i++;
  if (!options.other) throw new IcuSyntaxError(`${kind} without "other" in: ${p.s}`);
  return { type: kind, name, options, offset };
}

/** Lists argument names used by a message (for placeholder consistency checks). */
export function argNames(message) {
  const names = new Set();
  const walk = (nodes) => nodes.forEach((n) => {
    if (typeof n === 'string' || n.type === 'pound') return;
    names.add(n.name);
    if (n.options) Object.values(n.options).forEach(walk);
  });
  walk(parse(message));
  return names;
}

const intlCache = new Map();
function intl(Ctor, locale, opts = {}) {
  const k = Ctor.name + locale + JSON.stringify(opts);
  let v = intlCache.get(k);
  if (!v) { v = new Ctor(locale, opts); intlCache.set(k, v); }
  return v;
}
function fmtNumber(locale, n, style) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '');
  const opts = style === 'integer' ? { maximumFractionDigits: 0 } : style === 'percent' ? { style: 'percent' } : {};
  return intl(Intl.NumberFormat, locale, opts).format(n);
}

/** Formats `message` with `args` for `locale`. Missing args render as empty strings. */
export function format(message, args = {}, locale = 'en') {
  return render(parse(message), args, locale, null);
}

function render(nodes, args, locale, pound) {
  let s = '';
  for (const n of nodes) {
    if (typeof n === 'string') { s += n; continue; }
    switch (n.type) {
      case 'pound': s += pound == null ? '#' : fmtNumber(locale, pound); break;
      case 'arg': { const v = args[n.name]; s += v == null ? '' : typeof v === 'number' ? fmtNumber(locale, v) : String(v); break; }
      case 'number': s += fmtNumber(locale, Number(args[n.name]), n.style); break;
      case 'select': s += render(n.options[String(args[n.name])] || n.options.other, args, locale, pound); break;
      case 'plural':
      case 'selectordinal': {
        const raw = Number(args[n.name]);
        const v = raw - n.offset;
        let branch = n.options['=' + raw];
        if (!branch) {
          const cat = Number.isFinite(v) ? intl(Intl.PluralRules, locale, { type: n.type === 'plural' ? 'cardinal' : 'ordinal' }).select(v) : 'other';
          branch = n.options[cat] || n.options.other;
        }
        s += render(branch, args, locale, v);
        break;
      }
      default: break;
    }
  }
  return s;
}
