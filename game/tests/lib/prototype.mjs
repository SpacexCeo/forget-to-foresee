// Loads prototype-2d/index.html into a Node VM so its untouched game code can
// serve as the reference implementation for parity tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HTML = fileURLToPath(new URL('../../../prototype-2d/index.html', import.meta.url));

export function loadPrototype() {
  const html = readFileSync(HTML, 'utf8');
  const code = html.split('<script>')[1].split('</script>')[0];
  const inputs = {};
  const app = { innerHTML: '', querySelector: () => null };
  const document = {
    getElementById: (id) => (id === 'app' ? app : { value: inputs[id] ?? '' }),
    addEventListener: () => {},
    querySelector: () => null,
  };
  const ctx = vm.createContext({ document, window: {}, TextEncoder, console });
  vm.runInContext(code + `
globalThis.__api = { getS: () => S, setS: (v) => { S = v; }, ACT, newSeason, finish, checkBought,
  confidentCells, readGlyph, guess, dictVotes, isBroken, hasBetrayal, topBid, TICKS, DEADLINE };`, ctx);
  const api = ctx.__api;

  /** Applies one intent exactly the way the 2D UI would, including its click-handler settle. */
  function apply(intent) {
    const S = api.getS();
    const click = (fn) => { fn(); const s = api.getS(); if (s.H >= 100 && s.phase === 'play') api.finish('gone'); };
    switch (intent.type) {
      case 'start': inputs['key-in'] = intent.phrase; click(() => api.ACT.start()); break;
      case 'rule': S.rule = intent.r; api.checkBought(); break; // change handler: no settle
      case 'anchor': click(() => api.ACT.anchor({ p: String(intent.p), t: String(intent.t) })); break;
      case 'ask': S.ui.sel = [intent.s, intent.f]; inputs['ask-m'] = String(intent.m); click(() => api.ACT.ask()); break;
      case 'forget': S.ui.keyMode = intent.purpose === 'key'; click(() => api.ACT['forget-yes']({ id: String(intent.id) })); break;
      case 'speak': click(() => api.ACT.speak()); break;
      case 'mend': click(() => api.ACT.mend({ j: String(intent.j) })); break;
      case 'mediate': click(() => api.ACT.mediate({ i: String(intent.i), j: String(intent.j) })); break;
      case 'accept': click(() => api.ACT.accept({ id: String(intent.id) })); break;
      case 'decline': click(() => api.ACT.decline({ id: String(intent.id) })); break;
      case 'bid': click(() => api.ACT.bid({ id: String(intent.id) })); break;
      case 'contribute': click(() => api.ACT.contribute()); break;
      case 'end': click(() => api.ACT.end()); break;
      case 'vote': click(() => api.ACT.vote({ v: intent.v ? '1' : '0' })); break;
      default: throw new Error('unknown intent ' + intent.type);
    }
  }
  return { api, apply, newSeason: (seed) => api.newSeason(seed), state: () => api.getS(), setState: (s) => api.setS(s) };
}
