// Render layers. Cameras must enable LAYER_OVERLAY to see labels, mist sprites and markers; the
// post-processing g-buffer passes (ambient occlusion) render without it, so camera-facing quads
// never leave black blocks in the occlusion buffer.
export const LAYER_DEFAULT = 0;
export const LAYER_OVERLAY = 1;
