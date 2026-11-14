// Loomblade grips for the heroines' other rigs (3D A, 14.11): the new Tripo Iris (R_Hand, R_Index1..3, R_Thumb1..3) and
// Elise (Mixamo, mixamorigRightHand...) have no `prop_R` socket, so play/grip-pose.js (the game's own rig) does not fit
// them. Each entry: {rig, seat: the bone the sword hangs on, sword_in_seat: column-major 4x4 in that bone's space,
// pose: {bone: [x, y, z, w]} local quaternions of the closed fingers}. Empty until the grip is fitted in Blender on the
// new rigs: until then those heroines fight with empty hands (play/held-blade.js pickGrip), never a sword at a guess.
export const GRIPS = Object.freeze([]);
