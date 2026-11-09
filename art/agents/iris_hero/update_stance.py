"""Refresh Iris's standing leg animation in a recovered full-build Blender file.

Run with Blender: --python update_stance.py -- source.blend output-directory
The source is never overwritten. Textures are packed into the new editable file.
Existing face, upper-body, hair, walking and running curves are preserved.
"""

import hashlib
import json
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent_anim as anim


def mesh_digest():
    import struct
    digest = hashlib.sha256()
    for obj in sorted(bpy.data.objects, key=lambda item: item.name):
        if obj.type != "MESH":
            continue
        digest.update(obj.name.encode())
        for vertex in obj.data.vertices:
            digest.update(struct.pack("<3f", *vertex.co))
    return digest.hexdigest()


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    source, output = map(os.path.abspath, args[:2])
    if os.path.dirname(source) == output:
        raise ValueError("Use a separate output directory to preserve the recovered source.")
    os.makedirs(output, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=source)
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    original_mesh = mesh_digest()
    for image in bpy.data.images:
        if image.source != "FILE":
            continue
        local = os.path.join(os.path.dirname(source), os.path.basename(image.filepath))
        if os.path.isfile(local):
            image.filepath = local
            image.reload()
            image.pack()
        elif not image.packed_file:
            raise FileNotFoundError("Missing source texture: " + image.name)

    ankle = rig.data.bones["shin_L"].tail_local
    anim.set_ankle(abs(ankle.x), ankle.z)
    solver = anim.Solver(rig)
    targets = ["pelvis"] + [part + "_" + side for part in ("thigh", "shin", "foot", "toe") for side in ("L", "R")]
    standing = [name for name in anim.CLIPS if name not in ("walk", "run")]
    ad = rig.animation_data
    track_mutes = [(track, track.mute) for track in ad.nla_tracks]
    for track, _ in track_mutes:
        track.mute = True
    report = {"source": source, "standing_extra_width_m": anim.STYLE["iris"]["width"], "clips": {}}
    for clip in standing:
        action = bpy.data.actions.get(clip)
        if action is None:
            raise ValueError("Source is missing the expected action: " + clip)
        ad.action = action
        frames, loop, _ = anim.CLIPS[clip]
        previous = {}
        first_span = None
        for frame in range(frames + 1):
            u = 0.0 if loop and frame == frames else frame / frames
            spec = anim.CLIP_FN[clip]("iris", anim.STYLE["iris"], u)
            pose, basis, _ = solver.solve(spec)
            if frame == 0:
                first_span = abs(spec.feet[1]["ankle"].x - spec.feet[-1]["ankle"].x)
            for name in targets:
                bone = rig.pose.bones[name]
                location, rotation = basis[name]
                rotation = rotation.normalized()
                if name in previous and previous[name].dot(rotation) < 0:
                    rotation = -rotation
                previous[name] = rotation
                bone.rotation_quaternion = rotation
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=name)
                if name == "pelvis":
                    bone.location = location
                    bone.keyframe_insert("location", frame=frame, group=name)
        for curve in anim._fcurves(action):
            if any(curve.data_path.startswith('pose.bones["' + name + '"]') for name in targets):
                for point in curve.keyframe_points:
                    point.interpolation = "LINEAR"
        report["clips"][clip] = {"frames": frames + 1, "first_frame_ankle_span_m": first_span}
    ad.action = None
    for track, mute in track_mutes:
        track.mute = mute
    for bone in rig.pose.bones:
        bone.rotation_quaternion = Quaternion()
        bone.location = Vector()
    scene.frame_set(0)
    report["geometry_unchanged"] = mesh_digest() == original_mesh
    assert report["geometry_unchanged"]
    scene.render.fps = anim.FPS
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(output, "iris_hero.blend"), compress=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in scene.objects:
        skinned = obj.type == "MESH" and obj.name != "body_review_full" and any(mod.type == "ARMATURE" and mod.object == rig for mod in obj.modifiers)
        if obj == rig or skinned or obj.name.endswith("_col") or obj.name.startswith("socket_"):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(output, "agent_iris.glb"), export_format="GLB", use_selection=True,
        export_apply=False, export_yup=True, export_tangents=True, export_extras=True,
        export_image_format="AUTO", export_cameras=False, export_lights=False, export_skins=True,
        export_all_influences=False, export_def_bones=False, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_step=1,
        export_morph=True, export_morph_normal=True, export_morph_animation=True,
        export_reset_pose_bones=True, export_optimize_animation_size=False,
        export_rest_position_armature=True)
    with open(os.path.join(output, "stance-report.json"), "w", encoding="utf8") as handle:
        json.dump(report, handle, indent=2)
    print("RESULT", json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
