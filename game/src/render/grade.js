// The game's colour grade, inside the tone mapping (docs/atmosphere.md). Every material's shader tone-maps its own
// output on the direct path (low tier, phones) and the post stack tone-maps once at the end (ultra, high): putting
// the grade into three.js's CustomToneMapping hook gives all of them the same colours with no extra pass.
//   AgX base       keeps highlights from clipping to flat white and hues from skewing (amber stays amber longer)
//   saturation     AgX alone is pale: colour is brought back around luminance
//   contrast       a soft S-curve on a square-root encoding (pivot near mid grey), toe and shoulder stay smooth
//   split toning   cool shadows, warm highlights: the cool-shade / warm-light pair of the art direction
// The values are constants in the shader chunk (uniforms would have to be added to every ShaderMaterial in the
// game); time of day and weather change the light, the grade stays, which is what keeps the white balance the
// same in the town and on the archipelago. `gradeColor` is the same maths in JS for the tests.
import * as THREE from 'three';

export const GRADE = Object.freeze({
  saturation: 1.24, contrast: 0.4,
  shadowTint: Object.freeze([0.965, 0.985, 1.03]), highlightTint: Object.freeze([1.04, 1.0, 0.95]),
});

const f = (v) => Number(v).toFixed(4);
const vec3 = (a) => `vec3( ${a.map(f).join(', ')} )`;

const CUSTOM = /* glsl */`
vec3 CustomToneMapping( vec3 color ) {
	vec3 c = AgXToneMapping( color );
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = max( mix( vec3( l ), c, ${f(GRADE.saturation)} ), 0.0 );
	vec3 g = sqrt( c );
	g = mix( g, g * g * ( 3.0 - 2.0 * g ), ${f(GRADE.contrast)} );
	c = g * g;
	c *= mix( ${vec3(GRADE.shadowTint)}, ${vec3(GRADE.highlightTint)}, smoothstep( 0.04, 0.6, l ) );
	return clamp( c, 0.0, 1.0 );
}`;

const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
let installed = false;

/** Installs the grade as three.js's custom tone mapping. Call before the first material compiles. */
export function installGrade(renderer) {
  if (!installed) {
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    if (chunk.includes(STOCK)) { THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(STOCK, CUSTOM); installed = true; }
    else console.warn('[grade] three.js tone mapping chunk changed: plain AgX');
  }
  if (renderer) renderer.toneMapping = installed ? THREE.CustomToneMapping : THREE.AgXToneMapping;
  return installed;
}

/** The display-referred part of the grade (after AgX) on a linear RGB triple in 0..1. */
export function gradeColor(rgb, G = GRADE) {
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const t = Math.min(1, Math.max(0, (l - 0.04) / 0.56)), k = t * t * (3 - 2 * t);
  return rgb.map((v, i) => {
    let c = Math.max(0, l + (v - l) * G.saturation);
    let g = Math.sqrt(c);
    g += (g * g * (3 - 2 * g) - g) * G.contrast;
    c = g * g * (G.shadowTint[i] + (G.highlightTint[i] - G.shadowTint[i]) * k);
    return Math.min(1, Math.max(0, c));
  });
}
