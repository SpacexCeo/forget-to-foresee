// Procedural layers over Iris's existing clips for the prologue (sprint plan 9.9): nothing is redrawn and no clip is
// changed; after the mixer has posed her, a few bones get an extra rotation, each layer with a weight 0..1.
// Bones of the shared agent rig; rotations are in the bone's parent frame (premultiplied), axes in model space
// (x = her left, y up, z = her front).
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), pw = new THREE.Quaternion(), wq = new THREE.Quaternion();

export function createIrisPoses(model) {
  const bone = (n) => model.getObjectByName(n) || null;
  const B = { spine: bone('spine'), chest: bone('chest'), neck: bone('neck'), armR: bone('upperarm_R'), armL: bone('upperarm_L'), foreR: bone('forearm_R'), foreL: bone('forearm_L') };
  /** Rotates a bone by `angle` about a MODEL-space axis, whatever its own frame is. */
  const turn = (b, axis, angle) => {
    if (!b || !angle) return;
    b.parent.getWorldQuaternion(pw); model.getWorldQuaternion(wq);
    const local = axis.clone().applyQuaternion(wq).applyQuaternion(pw.invert());     // the axis in the bone's parent frame
    q.setFromAxisAngle(local.normalize(), angle); b.quaternion.premultiply(q);
  };
  return {
    /**
     * @param {{lean?: number, reach?: number, raise?: number, startle?: number}} w weights 0..1
     *   lean: over the desk (spine 8 degrees forward); reach: right hand to the keyboard; raise: right arm half up
     *   toward the device; startle: back 25 degrees, both arms up.
     */
    apply(w = {}) {
      model.updateMatrixWorld(true);
      const lean = (w.lean || 0) * 0.14 - (w.startle || 0) * 0.44;
      turn(B.spine, X, lean * 0.5); turn(B.chest, X, lean * 0.5); turn(B.neck, X, -(w.startle || 0) * 0.2);
      const up = (w.raise || 0) * 0.61 + (w.reach || 0) * 0.9 + (w.startle || 0) * 1.3;
      turn(B.armR, X, -up); turn(B.foreR, X, -(w.reach || 0) * 0.5 - (w.startle || 0) * 0.6);
      turn(B.armL, X, -(w.startle || 0) * 1.2 - (w.reach || 0) * 0.35); turn(B.foreL, X, -(w.startle || 0) * 0.6);
      turn(B.armR, Z, (w.startle || 0) * 0.3); turn(B.armL, Z, -(w.startle || 0) * 0.3);
    },
  };
}
