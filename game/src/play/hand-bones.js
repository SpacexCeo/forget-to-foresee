// The heroine's hand bones across her rigs (3D A, 14.11: the new Tripo heroines landed). The game's own rig names the
// right hand `hand_R`; the new Iris (Tripo) `R_Hand`; Elise (Mixamo) `mixamorig:RightHand`, which three.js's
// GLTFLoader loads as `mixamorigRightHand` (PropertyBinding.sanitizeNodeName drops the colon). Every hand lookup (the
// cast's start point, the hit fx, the held blade's seat) goes through findHandBone. Pure (no three.js import).

export const HAND_BONES = Object.freeze({
  R: Object.freeze(['hand_R', 'R_Hand', 'mixamorigRightHand', 'mixamorig:RightHand', 'RightHand', 'Hand_R', 'hand.R', 'hand_r']),
  L: Object.freeze(['hand_L', 'L_Hand', 'mixamorigLeftHand', 'mixamorig:LeftHand', 'LeftHand', 'Hand_L', 'hand.L', 'hand_l']),
});

/** A last resort by pattern: "...RightHand", "R_Hand", "hand_R" with any prefix (not the fingers: "RightHandIndex1"). */
const LOOSE = { R: /(^|[^a-z])(right_?hand|r_hand|hand_r)$/i, L: /(^|[^a-z])(left_?hand|l_hand|hand_l)$/i };

/**
 * The hand bone of a model (side 'R' or 'L'), or null.
 * @param {{getObjectByName?: (n: string) => any, traverse?: (f: (o: any) => void) => void} | null} root
 */
export function findHandBone(root, side = 'R') {
  if (!root || typeof root.getObjectByName !== 'function') return null;
  for (const n of HAND_BONES[side] || []) { const b = root.getObjectByName(n); if (b) return b; }
  let found = null;
  if (typeof root.traverse === 'function') root.traverse((o) => { if (!found && o && o.isBone && LOOSE[side].test(String(o.name || '').split(/[|:/]/).pop())) found = o; });
  return found;
}

/** Which rig a model wears, by its right hand: 'agent' (hand_R), 'tripo' (R_Hand), 'mixamo', or null. */
export function rigOf(root) {
  const h = findHandBone(root, 'R');
  if (!h) return null;
  const n = String(h.name);
  if (n === 'hand_R') return 'agent';
  if (n === 'R_Hand') return 'tripo';
  if (/mixamorig/i.test(n)) return 'mixamo';
  return 'other';
}
