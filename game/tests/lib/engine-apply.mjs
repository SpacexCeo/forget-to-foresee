// Maps a recorded intent onto the engine's action API.
import * as E from '../../src/game/engine.js';

export function applyToEngine(it) {
  switch (it.type) {
    case 'start': E.startGame(it.phrase); return { ok: true };
    case 'rule': return E.setRule(it.r);
    case 'anchor': return E.placeAnchor(it.p, it.t);
    case 'ask': return E.askGuests(it.s, it.f, it.m);
    case 'forget': return E.forget(it.id, it.purpose);
    case 'speak': return E.speakKey();
    case 'mend': return E.mend(it.j);
    case 'mediate': return E.mediate(it.i, it.j);
    case 'accept': return E.acceptOffer(it.id);
    case 'decline': return E.declineOffer(it.id);
    case 'bid': return E.bid(it.id);
    case 'contribute': return E.contributeMine();
    case 'end': return { ok: E.endTick() };
    case 'vote': return E.castVote(it.v);
    default: throw new Error('unknown intent ' + it.type);
  }
}
