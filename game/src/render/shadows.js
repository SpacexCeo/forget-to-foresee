// Sun shadows for both locations (docs/atmosphere.md): two cascades from one sun.
//   near   follows Iris, sized from the camera distance in fixed steps, redrawn every frame: crisp
//          shadows of characters on streets and stairs
//   far    covers the play area around her (the tier's `shadowDistance`), centred on a coarse grid and
//          redrawn only every few frames or when it moves: buildings, cliffs, far islands
// Both are ordinary three.js directional lights with a shadow map. The far light is black (it adds no
// light); the patched light loop below gives the near light a shadow term blended from both maps, and
// fades the shadow out at the far edge instead of ending in a line. Each cascade's centre is snapped to
// whole shadow texels in light space, so nothing shimmers as the camera moves, and its biases follow
// its texel size (no acne on the far map, no peter-panning on the near one).
// Phones and the low tier use the near cascade alone, wider (`cascades: 1`), with the same edge fade.
// The pure parts (sizes, snapping, bias) are covered by tests/client/atmosphere.test.mjs.
import * as THREE from 'three';

/** Half-sizes (m) the near cascade may take: fixed steps, so zooming does not resize texels continuously. */
export const NEAR_STEPS = Object.freeze([12, 18, 26, 38, 56]);

/** Near cascade half-size for a camera distance: the smallest step that covers what the camera sees around Iris. */
export function nearRadius(camDist, steps = NEAR_STEPS) {
  const want = Math.max(0, Number(camDist) || 0) * 1.1 + 4;
  for (const s of steps) if (s >= want) return s;
  return steps[steps.length - 1];
}

/**
 * The cascades for a tier: [{radius, mapSize, texel, bias, normalBias, every}], near first.
 * @param {{shadowMap:number, shadowDistance:number, cascades?:number, shadowFarMap?:number, shadowFarEvery?:number}} cfg
 * @param {number} camDist
 */
export function cascadePlan(cfg, camDist) {
  const map = Math.max(0, cfg.shadowMap | 0);
  if (!map) return [];
  const two = (cfg.cascades || 1) >= 2;
  // One cascade: wider than the two-cascade near one (it is all there is), never beyond the tier's shadow distance.
  const nearR = two ? Math.min(nearRadius(camDist), cfg.shadowDistance * 0.5) : Math.min(cfg.shadowDistance, Math.max(cfg.shadowDistance * 0.5, nearRadius(camDist) * 1.5));
  const plan = [cascade(nearR, map, 1)];
  if (two) plan.push(cascade(cfg.shadowDistance, cfg.shadowFarMap || map, Math.max(1, cfg.shadowFarEvery || 2)));
  return plan;
}

function cascade(radius, mapSize, every) {
  const texel = (2 * radius) / mapSize;
  // The normal offset hides acne on slopes (one and a half texels); the depth bias covers what is left.
  return { radius, mapSize, texel, every, normalBias: Math.min(0.6, Math.max(0.02, texel * 1.5)), bias: -Math.min(0.0012, 0.00012 + texel * 0.002) };
}

/** Snaps a light-space coordinate to whole texels. */
export const snapTexel = (v, texel) => Math.round(v / texel) * texel;

const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const CASCADE_PARS = /* glsl */`
#ifdef USE_SHADOWMAP
  // 1 inside a shadow frustum, 0 at its edge (xy) and at its far plane.
  float ftfShadowInside( vec4 coord, float from ) {
    vec3 c = coord.xyz / coord.w;
    vec2 e = abs( c.xy * 2.0 - 1.0 );
    return ( 1.0 - smoothstep( from, 0.98, max( e.x, e.y ) ) ) * step( c.z, 1.0 );
  }
#endif
`;

const CASCADE_LINE = /* glsl */`
		#if NUM_DIR_LIGHT_SHADOWS == 2
			// Cascaded sun (render/shadows.js): light 0 is the sun with the near map, light 1 is black and carries the far map.
			#if UNROLLED_LOOP_INDEX == 0
			if ( directLight.visible && receiveShadow ) {
				float ftfNear = ftfShadowInside( vDirectionalShadowCoord[ 0 ], 0.8 );
				float ftfFar = ftfShadowInside( vDirectionalShadowCoord[ 1 ], 0.86 );
				float ftfShadow = 1.0;
				if ( ftfNear < 1.0 && ftfFar > 0.0 ) ftfShadow = mix( 1.0, getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), ftfFar );
				if ( ftfNear > 0.0 ) ftfShadow = mix( ftfShadow, getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] ), ftfNear );
				directLight.color *= ftfShadow;
			}
			#endif
		#else
			directLight.color *= ( directLight.visible && receiveShadow ) ? mix( 1.0, getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ), ftfShadowInside( vDirectionalShadowCoord[ i ], 0.86 ) ) : 1.0;
		#endif`;

let installed = false;

/** Patches the directional light loop once, before any material compiles. Returns false if three.js changed the line. */
export function installCascadeShadows() {
  if (installed) return true;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(SHADOW_LINE)) { console.warn('[shadows] three.js light loop changed: cascades off'); return false; }
  THREE.ShaderChunk.lights_fragment_begin = chunk.replace(SHADOW_LINE, CASCADE_LINE);
  THREE.ShaderChunk.shadowmap_pars_fragment += CASCADE_PARS;
  installed = true;
  return true;
}

const _view = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _zero = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class SunShadows {
  /** @param {{scene: THREE.Scene}} o */
  constructor({ scene }) {
    this.patched = installCascadeShadows();
    /** The sun: lights the scene and carries the near cascade. */
    this.sun = new THREE.DirectionalLight(0xffffff, 3.6);
    this.sun.name = 'sun';
    /** Black: adds no light. Its shadow map is the far cascade, read by the patched loop of the sun. */
    this.far = new THREE.DirectionalLight(0x000000, 1);
    this.far.name = 'sun_far_cascade';
    for (const l of [this.sun, this.far]) { l.castShadow = true; l.shadow.camera.near = 1; }
    // Order matters to the patched loop: the sun is added first, so it is directional light 0.
    scene.add(this.sun, this.sun.target, this.far, this.far.target);
    this.dir = new THREE.Vector3(0, 1, 0);
    this.cfg = null; this.plan = [];
    this.frame = 0; this.farKey = '';
  }

  setDirection(dir) { this.dir.copy(dir).normalize(); this.farKey = ''; }

  /** @param {object} cfg the tier's knobs (quality.js) */
  configure(cfg) {
    this.cfg = cfg;
    const two = this.patched && (cfg.cascades || 1) >= 2 && cfg.shadowMap > 0;
    this.cascades = two ? 2 : 1;
    this.sun.castShadow = cfg.shadowMap > 0;
    // Without the patch or on one-cascade tiers the far light leaves the light list (one compile per tier change).
    this.far.visible = two; this.far.castShadow = two;
    this.resize(this.sun, cfg.shadowMap);
    if (two) this.resize(this.far, cfg.shadowFarMap || cfg.shadowMap);
    this.sun.shadow.radius = cfg.shadowRadius; this.far.shadow.radius = cfg.shadowRadius;
    this.far.shadow.autoUpdate = false;
    this.farKey = '';
  }

  resize(light, size) {
    size = Math.max(1, size | 0);
    const map = light.shadow.map;
    if (map && map.width !== size) { map.dispose(); light.shadow.map = null; }
    light.shadow.mapSize.set(size, size);
  }

  /** Places one cascade around `focus`, snapped to its texels in light space. Returns the snapped centre (shared vector). */
  place(light, c, focus) {
    const sc = light.shadow.camera;
    if (sc.right !== c.radius) { sc.left = -c.radius; sc.right = c.radius; sc.top = c.radius; sc.bottom = -c.radius; }
    // Casters between the sun and the cascade: the light stands well outside the box.
    const back = c.radius + 140;
    sc.far = back + c.radius + 60;
    sc.updateProjectionMatrix();
    light.shadow.bias = c.bias; light.shadow.normalBias = c.normalBias;
    _view.lookAt(this.dir, _zero, _up); _inv.copy(_view).invert();
    _p.copy(focus).applyMatrix4(_inv);
    _p.x = snapTexel(_p.x, c.texel); _p.y = snapTexel(_p.y, c.texel);
    _p.applyMatrix4(_view);
    light.target.position.copy(_p);
    light.position.copy(_p).addScaledVector(this.dir, back);
    light.target.updateMatrixWorld();
    return _p;
  }

  /** Per frame. @param {THREE.Vector3} focus the player's chest @param {number} camDist */
  update(focus, camDist) {
    if (!this.cfg || !this.sun.castShadow) return;
    const plan = this.plan = cascadePlan({ ...this.cfg, cascades: this.cascades }, camDist);
    this.place(this.sun, plan[0], focus);
    this.frame++;
    if (plan.length < 2) return;
    // The far cascade sits on a coarse grid (a quarter of its size): it moves rarely, and when it does not move
    // it is redrawn only every few frames (far characters and newly streamed models still get their shadows).
    const far = plan[1], grid = far.radius / 4;
    const gx = Math.round(focus.x / grid), gy = Math.round(focus.y / grid), gz = Math.round(focus.z / grid);
    const key = gx + ',' + gy + ',' + gz + ',' + far.radius;
    const moved = key !== this.farKey;
    if (moved) { this.farKey = key; this.place(this.far, far, _p.set(gx * grid, gy * grid, gz * grid)); }
    if (moved || this.frame % far.every === 0) this.far.shadow.needsUpdate = true;
  }

  /** Numbers for the dev HUD and the tests. */
  stats() { return { cascades: this.plan.length, patched: this.patched, plan: this.plan.map((c) => ({ radius: c.radius, map: c.mapSize, texelCm: +(c.texel * 100).toFixed(1) })) }; }
}
