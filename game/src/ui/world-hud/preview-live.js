// hud-preview.html?live=1: plays a fixed local season for `ticks` trials through the same room code
// the agent API serves, then builds the world HUD model from the observation (from-obs.js).
import { createLocalTransport } from '../../play/transport-local.js';
import { PlaySession } from '../../play/session.js';
import { createPlayContext, renderMsg } from '../../play/i18n.js';
import { i18n as uiI18n } from '../index.js';
import { buildHudModel } from './from-obs.js';

const SEED = '0123456789abcdef0123456789abcdef';

export async function liveModel({ ticks = 3, mode = 'novice', lang } = {}) {
  const ctx = createPlayContext({ locale: lang || undefined });
  const session = new PlaySession({ transport: createLocalTransport({ seedHex: SEED }), sleep: async () => {}, skipOnboarding: true });
  await session.start();
  for (let i = 1; i < ticks; i++) await session.send('end_tick', {});
  const i18n = ctx.i18n;
  const model = buildHudModel({
    obs: session.obs, goal: session.goal, options: session.options, defaultIndex: session.defaultIndex, i18n, mode,
    render: (k, a) => renderMsg(i18n, k, a),
    renderEvent: (e) => uiI18n.renderEvent(e, i18n),
    signsState: { open: true },
  });
  return { model, ctx, session };
}
