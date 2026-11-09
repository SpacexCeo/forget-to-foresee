import bpy
from mathutils import Vector

"""
Iris Body Shape Target Builder

What it does:
- Works on the selected mesh object.
- Creates/updates a shape key called BODY_FEM_TARGET.
- Pushes the body toward a feminine athletic silhouette:
  narrower waist, slightly wider pelvis, rounder glutes,
  more defined hip line, subtle thigh volume, slightly fuller chest.

Important:
- This is a topology-agnostic approximation based on local bounding-box regions.
- It is intended as a fast starting point, not a final sculpt.
- Best used on the BODY mesh only, not on clothing.

How to use:
1. Select the body mesh in Object Mode.
2. Open Scripting and run this file.
3. A shape key named BODY_FEM_TARGET will be created.
4. Set its value to 1.0 and adjust the config below if needed.
"""

# =========================
# CONFIG
# =========================
TARGET_KEY_NAME = "BODY_FEM_TARGET"
MIRROR_X = True

# Axis assumptions:
# X = left/right, Z = up/down, Y = front/back.
# If the glutes move the wrong direction, change GLUTE_PUSH_SIGN from 1.0 to -1.0.
GLUTE_PUSH_SIGN = -1.0
CHEST_PUSH_SIGN = 1.0

# Global influence multiplier
OVERALL_STRENGTH = 1.0

# Shape tuning
WAIST_IN_X = 0.045      # reduce waist width
UNDERBUST_IN_X = 0.018
RIBCAGE_IN_X = 0.010
PELVIS_OUT_X = 0.032
HIP_OUT_X = 0.050
GLUTE_OUT_Y = 0.060
GLUTE_UP_Z = 0.010
OUTER_THIGH_OUT_X = 0.022
INNER_THIGH_IN_X = 0.010
UPPER_THIGH_FWD_Y = 0.006
CALF_OUT_X = 0.008
CHEST_OUT_Y = 0.016
SHOULDER_IN_X = 0.014
LOWER_BACK_IN_Y = 0.008

# =========================
# HELPERS
# =========================
def clamp01(x):
    return max(0.0, min(1.0, x))


def smoothstep(edge0, edge1, x):
    if edge0 == edge1:
        return 0.0
    t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def band(center, half_width, x):
    d = abs(x - center)
    if d >= half_width:
        return 0.0
    t = 1.0 - (d / half_width)
    return t * t * (3.0 - 2.0 * t)


def ensure_basis_and_target(obj, key_name):
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)

    keys = obj.data.shape_keys.key_blocks
    if key_name in keys:
        target = keys[key_name]
    else:
        target = obj.shape_key_add(name=key_name, from_mix=False)

    basis = obj.data.shape_keys.key_blocks[0]
    return basis, target


def get_bbox_local(obj):
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    min_v = Vector((min(xs), min(ys), min(zs)))
    max_v = Vector((max(xs), max(ys), max(zs)))
    return min_v, max_v


def norm(v, min_v, max_v):
    sx = max(max_v.x - min_v.x, 1e-6)
    sy = max(max_v.y - min_v.y, 1e-6)
    sz = max(max_v.z - min_v.z, 1e-6)
    return Vector(((v.x - min_v.x) / sx, (v.y - min_v.y) / sy, (v.z - min_v.z) / sz))


def main():
    obj = bpy.context.active_object
    if obj is None or obj.type != 'MESH':
        raise RuntimeError("Select the BODY mesh object before running the script")

    bpy.ops.object.mode_set(mode='OBJECT')

    basis, target = ensure_basis_and_target(obj, TARGET_KEY_NAME)
    min_v, max_v = get_bbox_local(obj)

    for i, vert in enumerate(obj.data.vertices):
        base = basis.data[i].co.copy()
        uvw = norm(base, min_v, max_v)

        side = 1.0 if base.x >= 0.0 else -1.0
        abs_x = abs(base.x)
        dx = 0.0
        dy = 0.0
        dz = 0.0

        # -------------------------
        # Vertical masks (approx body regions)
        # -------------------------
        waist_mask = band(0.59, 0.08, uvw.z)
        underbust_mask = band(0.67, 0.06, uvw.z)
        ribcage_mask = band(0.73, 0.07, uvw.z)
        pelvis_mask = band(0.51, 0.07, uvw.z)
        hip_mask = band(0.46, 0.08, uvw.z)
        glute_mask = band(0.44, 0.09, uvw.z)
        upper_thigh_mask = band(0.34, 0.10, uvw.z)
        calf_mask = band(0.18, 0.08, uvw.z)
        chest_mask = band(0.69, 0.07, uvw.z)
        shoulder_mask = band(0.80, 0.06, uvw.z)
        lower_back_mask = band(0.56, 0.07, uvw.z)

        # -------------------------
        # Horizontal masks / center falloff
        # -------------------------
        center_mask = 1.0 - smoothstep(0.10, 0.28, abs_x)
        mid_side_mask = smoothstep(0.04, 0.14, abs_x) * (1.0 - smoothstep(0.22, 0.36, abs_x))
        outer_side_mask = smoothstep(0.12, 0.24, abs_x)
        inner_leg_mask = center_mask

        # -------------------------
        # Front/back masks in local Y
        # -------------------------
        front_mask = smoothstep(0.56, 0.78, uvw.y)
        back_mask = 1.0 - smoothstep(0.34, 0.56, uvw.y)
        middle_y_mask = band(0.50, 0.18, uvw.y)

        # -------------------------
        # Silhouette shaping
        # -------------------------
        # Narrower torso / waist
        dx += -side * WAIST_IN_X * waist_mask * (0.55 * center_mask + 0.70 * mid_side_mask)
        dx += -side * UNDERBUST_IN_X * underbust_mask * (0.45 * center_mask + 0.55 * mid_side_mask)
        dx += -side * RIBCAGE_IN_X * ribcage_mask * (0.30 * center_mask + 0.35 * mid_side_mask)

        # Slightly narrower shoulders
        dx += -side * SHOULDER_IN_X * shoulder_mask * (0.35 * mid_side_mask + 0.25 * outer_side_mask)

        # Wider pelvis / hips
        dx += side * PELVIS_OUT_X * pelvis_mask * (0.50 * mid_side_mask + 0.30 * outer_side_mask)
        dx += side * HIP_OUT_X * hip_mask * (0.65 * mid_side_mask + 0.75 * outer_side_mask)

        # Rounder glutes (push back and slightly up)
        dy += GLUTE_PUSH_SIGN * GLUTE_OUT_Y * glute_mask * back_mask * (0.55 * center_mask + 0.70 * mid_side_mask)
        dz += GLUTE_UP_Z * glute_mask * back_mask * (0.40 * center_mask + 0.50 * mid_side_mask)

        # Slight lower back tuck to accent S-curve
        dy += -GLUTE_PUSH_SIGN * LOWER_BACK_IN_Y * lower_back_mask * back_mask * center_mask

        # Thigh shaping: fuller outer thigh, cleaner inner thigh gap area
        dx += side * OUTER_THIGH_OUT_X * upper_thigh_mask * outer_side_mask
        dx += -side * INNER_THIGH_IN_X * upper_thigh_mask * inner_leg_mask * 0.85
        dy += UPPER_THIGH_FWD_Y * upper_thigh_mask * front_mask * mid_side_mask

        # Slight calf refinement
        dx += side * CALF_OUT_X * calf_mask * (0.35 * mid_side_mask + 0.40 * outer_side_mask)

        # Subtle chest projection
        dy += CHEST_PUSH_SIGN * CHEST_OUT_Y * chest_mask * front_mask * center_mask

        # Small z lift on hips to tighten silhouette
        dz += 0.004 * hip_mask * mid_side_mask

        new_co = base + Vector((dx, dy, dz)) * OVERALL_STRENGTH

        if MIRROR_X:
            # Maintain symmetry numerically by preserving x sign logic only.
            pass

        target.data[i].co = new_co

    # Activate target shape key for preview
    for kb in obj.data.shape_keys.key_blocks:
        if kb.name == TARGET_KEY_NAME:
            kb.value = 1.0
            kb.slider_min = 0.0
            kb.slider_max = 1.5
        elif kb.name != 'Basis':
            kb.value = kb.value

    obj.active_shape_key_index = list(obj.data.shape_keys.key_blocks.keys()).index(TARGET_KEY_NAME)
    print(f"Created/updated shape key: {TARGET_KEY_NAME}")


if __name__ == "__main__":
    main()
