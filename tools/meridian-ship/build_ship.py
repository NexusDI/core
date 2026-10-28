"""Build the SV-01 Meridian concept mesh from the ship geometry and render it.

Run inside Blender (5.2 or later), in the background:

    blender --background --factory-startup --python tools/meridian-ship/build_ship.py -- \
        --out <dir> [--views side,top,cutaway,hero,silhouette,svg] [--width 2048] [--blend <file>]

The script reads examples/meridian-systems/deck/meridian.geometry.json, the
layout the deck view also draws from. Ship axes map straight onto Blender's: x
runs aft from the bow, y to starboard and z up from the ventral skin, in
metres. The mesh is a drawing aid for the 2D views: a few lofted hull volumes
under a bevel, one layer of plates, and the exterior parts that change the
silhouette. Nothing here is random, so the same file gives the same renders.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# Importing ship_svg would leave a __pycache__ folder in the repo.
sys.dont_write_bytecode = True

from ship_svg import (  # noqa: E402
    DEFAULT_GEOMETRY,
    ROOM_COLOURS,
    Hull,
    export_svgs,
    hump_rings,
    lerp,
    load,
    nacelle_outline,
    shroud_rings,
)

VIEWS = ("side", "top", "cutaway", "hero", "silhouette", "svg")
CONDUIT_COLOURS = {"power": "#ffcc33", "coolant": "#33d6ff", "atmosphere": "#b6f07a"}


# --- helpers -----------------------------------------------------------------------------


def hex_rgba(value, alpha=1.0):
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # Blender colours are linear; the hex values are sRGB.
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, alpha)


_materials = {}


def material(name, colour, metallic=0.2, roughness=0.55, emission=None, strength=0.0):
    """One material per name. Workbench draws its display colour, Eevee its nodes."""
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    rgba = hex_rgba(colour)
    mat.diffuse_color = rgba
    mat.metallic = metallic
    mat.roughness = roughness
    if mat.node_tree is None and hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = hex_rgba(emission)
            bsdf.inputs["Emission Strength"].default_value = strength
    _materials[name] = mat
    return mat


def link(obj, coll_name, side="centre"):
    """Links `obj` into a collection and tags the hull side it sits on."""
    coll = bpy.data.collections.get(coll_name)
    if coll is None:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    coll.objects.link(obj)
    obj["side"] = side
    return obj


def mesh_object(name, verts, faces, mat, coll, side="centre", bevel=0.0):
    """A mesh from vertices and faces; `bevel` > 0 rounds its hard edges and fixes the shading."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    me.update()
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    if bevel > 0:
        for poly in me.polygons:
            poly.use_smooth = True
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(25)
        mod.harden_normals = True
        obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL").keep_sharp = True
    return link(obj, coll, side)


def box_object(name, x, y, z, mat, coll, side=None, inset=0.0, bevel=0.0):
    x0, x1, y0, y1 = x[0] + inset, x[1] - inset, y[0] + inset, y[1] - inset
    z0, z1 = z[0] + inset, z[1] - inset
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)]
    verts += [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if side is None:
        side = "port" if y1 < 0 else "starboard" if y0 > 0 else "centre"
    return mesh_object(name, verts, faces, mat, coll, side, bevel)


def loft(name, rings, mat, coll, side="centre", caps=True, closed=True, bevel=0.0):
    """Joins rings of equal length into one surface; a closed ring wraps round."""
    verts = [v for ring in rings for v in ring]
    n = len(rings[0])
    faces = []
    for r in range(len(rings) - 1):
        for k in range(n if closed else n - 1):
            a, b = r * n + k, r * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if caps:
        last = (len(rings) - 1) * n
        faces += [tuple(reversed(range(n))), tuple(range(last, last + n))]
    return mesh_object(name, verts, faces, mat, coll, side, bevel)


def circle(x, cy, cz, r, n=24):
    """A ring of n points round the line parallel to x through (cy, cz)."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        pts.append((x, cy + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def text_object(name, body, at, size, mat, coll, rotation=(0, 0, 0), side="centre"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.01
    curve.materials.append(mat)
    obj = bpy.data.objects.new(name, curve)
    obj.location = at
    obj.rotation_euler = rotation
    return link(obj, coll, side)


def tube_object(name, points, radius, mat, coll):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (co[0], co[1], co[2], 1.0)
    curve.materials.append(mat)
    return link(bpy.data.objects.new(name, curve), coll)


def offset_polyline(points, d):
    """Moves a (y, z) polyline outward by d along its averaged edge normals."""
    out = []
    for k, (y, z) in enumerate(points):
        normals = []
        for a, b in ((k - 1, k), (k, k + 1)):
            if 0 <= a and b < len(points):
                (y0, z0), (y1, z1) = points[a], points[b]
                ln = math.hypot(y1 - y0, z1 - z0) or 1.0
                normals.append(((z1 - z0) / ln, -(y1 - y0) / ln))
        ny = sum(n[0] for n in normals) / len(normals)
        nz = sum(n[1] for n in normals) / len(normals)
        ln = math.hypot(ny, nz) or 1.0
        out.append((y + d * ny / ln, z + d * nz / ln))
    return out


def clip_band(points, z0, z1):
    """The part of a profile running upward in z that lies between z0 and z1."""
    out = []
    for (ya, za), (yb, zb) in zip(points, points[1:]):
        lo, hi = max(min(za, zb), z0), min(max(za, zb), z1)
        if za == zb:
            if z0 <= za <= z1:
                out += [(ya, za), (yb, zb)]
            continue
        if lo > hi:
            continue
        for z in (lo, hi):
            t = (z - za) / (zb - za)
            out.append((lerp(ya, yb, t), z))
    dedup = []
    for p in out:
        if not dedup or math.dist(dedup[-1], p) > 1e-6:
            dedup.append(p)
    return dedup


# --- the hull: lofted volumes and one layer of plates ------------------------------------


def volume_rings(volume, hull, sign, xs):
    rings = []
    for x in xs:
        rings.append([(x, sign * y, z) for y, z in hull.half_profile(volume, x)])
    return rings


def plate(name, volume, hull, sign, x0, x1, band, mat, side, overhang=0.0):
    """A plate over one band of a volume's flank, standing 0.12 m proud of the core."""
    rings = []
    for x in (x0, x1):
        prof = clip_band(hull.half_profile(volume, max(x, volume["stations"][0]["x"])), *band)
        if len(prof) < 2:
            return None
        outer = offset_polyline(prof, 0.22)
        inner = offset_polyline(prof, 0.06)
        xx = x - overhang if x == x0 else x
        rings.append([(xx, sign * y, z) for y, z in outer + list(reversed(inner))])
    if len(rings[0]) != len(rings[1]):
        return None
    return loft(name, rings, mat, "Hull", side, bevel=0.05)


def plate_breaks(volume):
    """Seams at the volume's stations, with no plate longer than 6 m."""
    xs = sorted({s["x"] for s in volume["stations"]})
    out = [xs[0]]
    for a, b in zip(xs, xs[1:]):
        if b - a < 1.0:
            continue
        n = max(1, math.ceil((b - a) / 6.0))
        out += [a + (b - a) * k / n for k in range(1, n + 1)]
    return out


def build_hull(geometry, hull):
    core = material("hull-core", "#8a9098", 0.25, 0.5)
    light = material("hull-plate", "#b8bdc3", 0.2, 0.45)
    accent = material("hull-accent", "#5c636c", 0.25, 0.5)
    strip = geometry["exterior"]["windowStrip"]
    for volume in hull.volumes:
        xs = [s["x"] for s in volume["stations"]]
        breaks = plate_breaks(volume)
        for sign, side in ((1, "starboard"), (-1, "port")):
            loft(
                f"Hull.{volume['id']}.{side}",
                volume_rings(volume, hull, sign, xs),
                core,
                "Hull",
                side,
                closed=False,
                bevel=0.18,
            )
            if volume["id"] == "command":
                # The window strip runs between a lower plate and the brow, which
                # overhangs the bow face.
                low, brow = (0.0, strip["z"][0] - 0.05), (strip["z"][1] + 0.05, 99)
                plate(
                    f"Plate.command.low.{side}",
                    volume,
                    hull,
                    sign,
                    xs[0],
                    xs[-1],
                    low,
                    accent,
                    side,
                )
                plate(
                    f"Plate.command.brow.{side}",
                    volume,
                    hull,
                    sign,
                    xs[0],
                    xs[-1],
                    brow,
                    light,
                    side,
                    overhang=0.8,
                )
                continue
            for k, (a, b) in enumerate(zip(breaks, breaks[1:])):
                p = hull.params(volume, (a + b) / 2)
                band = (p["bottom"] + p["bdz"] * 0.5, p["top"] - 0.05)
                # The narrow neck takes the darker plate, so the masses either side read apart.
                mat = accent if volume["id"] in ("neck", "drive") else light
                plate(
                    f"Plate.{volume['id']}.{k}.{side}",
                    volume,
                    hull,
                    sign,
                    a + 0.08,
                    b - 0.08,
                    band,
                    mat,
                    side,
                )


# --- the exterior ------------------------------------------------------------------------


def oriented(obj, at, normal):
    obj.location = at
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    return obj


def dome(name, r, h, mat, side, n=16):
    """A low dome on the local xy plane, its axis on +z."""
    rings = []
    for k in range(5):
        a = math.pi / 2 * k / 4
        rr, z = max(r * math.cos(a), 0.02), h * math.sin(a)
        rings.append(
            [
                (rr * math.cos(2 * math.pi * j / n), rr * math.sin(2 * math.pi * j / n), z)
                for j in range(n)
            ]
        )
    return loft(name, rings, mat, "Exterior", side, bevel=0.0)


def build_exterior(geometry, hull):
    ext = geometry["exterior"]
    light = material("hull-plate", "#b8bdc3")
    accent = material("hull-accent", "#5c636c")
    dark = material("hull-dark", "#30353b", 0.3, 0.6)
    glass = material("window", "#0d141b", 0.2, 0.1, emission="#ffb36a", strength=0.12)
    vane = material("radiator", "#454a51", 0.5, 0.5, emission="#ff5a2a", strength=0.06)
    array = material("comms-array", "#5a626c", 0.4, 0.35)
    glow = material("exhaust", "#9fe9ff", 0.0, 0.3, emission="#7fdcff", strength=10.0)
    emitter = material("emitter", "#5d7f95", 0.6, 0.3, emission="#5fd0ff", strength=0.8)
    hazard = material("hazard", "#e0a800", 0.1, 0.6)

    # The window strip: dark glass recessed between the lower plate and the
    # brow, across the bow face and back along both flanks, split by the
    # barrel's spine on the centreline.
    z0, z1 = ext["windowStrip"]["z"]
    sx0, sx1 = ext["windowStrip"]["x"]
    for sign, side in ((1, "starboard"), (-1, "port")):
        # Sampled every 0.25 m so the strip follows the bow's taper.
        xs = [lerp(sx0, sx1, k / 24) for k in range(25)]
        rings = [[(x, sign * (hull.half_width_at(x, z) + 0.01), z) for z in (z0, z1)] for x in xs]
        loft(f"Window.{side}", rings, glass, "Exterior", side, caps=False, closed=False)
        w0 = hull.half_width_at(0.0, (z0 + z1) / 2)
        box_object(
            f"Window.face.{side}",
            (-0.03, 0.02),
            sorted((sign * 0.55, sign * (w0 - 0.3))),
            (z0, z1),
            glass,
            "Exterior",
            side,
        )
    rg = ext["railgun"]
    box_object(
        "Bow.spine",
        (-0.55, 3.0),
        (-0.5, 0.5),
        (3.2, rg["axis"]["z"]),
        accent,
        "Exterior",
        bevel=0.12,
    )

    # The railgun: shroud, breech hump, barrel and muzzle collar.
    loft("Railgun.shroud", shroud_rings(rg, hull), light, "Exterior", bevel=0.3)
    loft("Railgun.hump", hump_rings(rg, hull), light, "Exterior", bevel=0.4)
    ay, az, r = rg["axis"]["y"], rg["axis"]["z"], rg["boreRadius"]
    loft("Railgun.barrel", [circle(x, ay, az, r, 16) for x in (-0.6, rg["x"][1])], dark, "Exterior")
    loft(
        "Railgun.collar",
        [circle(x, ay, az, rr, 16) for x, rr in ((-0.9, 0.7), (0.4, 0.85))],
        accent,
        "Exterior",
        bevel=0.05,
    )

    # The comms housing: a faired pod on the habitat's roof with the phased
    # array flush in its outboard face.
    ch = ext["commsHousing"]
    hx0, hx1 = ch["x"]
    y0, y1 = ch["y"]
    rings = []
    for x, s in ((hx0, 0.1), (hx0 + 2.5, 1.0), (hx1 - 2.0, 1.0), (hx1, 0.15)):
        b = hull.top_at(x) - 0.2
        h = ch["height"] * s
        rings.append(
            [
                (x, y0, b),
                (x, y1, b),
                (x, y1 - 0.2, b + h * 0.55),
                (x, y1 - 1.6, b + h),
                (x, y0 + 0.5, b + h),
                (x, y0, b + h * 0.6),
            ]
        )
    loft("Comms.housing", rings, light, "Exterior", "starboard", bevel=0.35)
    b = hull.top_at((hx0 + hx1) / 2) - 0.2
    h = ch["height"]
    p, q = (y1 - 0.2 + 0.03, b + h * 0.55), (y1 - 1.6 + 0.03, b + h + 0.03)
    verts = [
        (hx0 + 2.7, p[0], p[1]),
        (hx1 - 2.2, p[0], p[1]),
        (hx1 - 2.2, q[0], q[1]),
        (hx0 + 2.7, q[0], q[1]),
    ]
    mesh_object("Comms.array", verts, [(0, 1, 2, 3)], array, "Exterior", "starboard")

    # The sensor blister on the command roof.
    sb = ext["sensorBlister"]
    sxc = sum(sb["x"]) / 2
    blister = dome("Sensor.blister", sb["radius"], sb["radius"] * 0.8, light, "starboard")
    blister.scale = ((sb["x"][1] - sb["x"][0]) / 2 / sb["radius"], 1.0, 1.0)
    blister.location = (sxc, sb["y"], hull.top_at(sxc) - 0.1)

    # The drive nacelles on their pylons, the radiator vanes and the bells.
    nv = ext["radiators"]["nacelleVanes"]
    drive = next(v for v in hull.volumes if v["id"] == "drive")
    for n in ext["nacelles"]:
        ny, nz = n["axis"]["y"], n["axis"]["z"]
        side = "starboard" if ny > 0 else "port"
        sign = 1 if ny > 0 else -1
        profile = nacelle_outline(n)[0]
        loft(
            f"{n['id']}.cowl",
            [circle(x, ny, nz, r) for x, r in profile],
            light,
            "Exterior",
            side,
            bevel=0.12,
        )
        loft(
            f"{n['id']}.intake",
            [circle(profile[0][0] - 0.02, ny, nz, profile[0][1] * 0.8)] * 2,
            dark,
            "Exterior",
            side,
        )
        px0, px1 = n["pylon"]["x"]
        inner = [hull.params(drive, x)["w"] - 0.3 for x in (px0, px1)]
        verts = [
            (px0, sign * inner[0], nz - 0.9),
            (px1, sign * inner[1], nz - 0.7),
            (px1 - 1.5, ny, nz - 0.6),
            (px0 + 1.0, ny, nz - 0.8),
        ]
        verts += [(x, y, z + (1.6 if k < 2 else 1.3)) for k, (x, y, z) in enumerate(verts)]
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        if sign < 0:
            faces = [tuple(reversed(f)) for f in faces]
        mesh_object(f"{n['id']}.pylon", verts, faces, accent, "Exterior", side, bevel=0.1)
        for k in range(nv["count"]):
            a = math.radians(lerp(nv["arcDeg"][0], nv["arcDeg"][1], k / max(1, nv["count"] - 1)))
            dy, dz = sign * math.cos(a), math.sin(a)
            ty, tz = -dz * 0.05, dy * 0.05
            r0, r1 = n["radius"] - 0.1, n["radius"] + nv["height"]
            quad = [
                (ny + dy * r0 - ty, nz + dz * r0 - tz),
                (ny + dy * r1 - ty, nz + dz * r1 - tz),
                (ny + dy * r1 + ty, nz + dz * r1 + tz),
                (ny + dy * r0 + ty, nz + dz * r0 + tz),
            ]
            rings = [[(x, y, z) for y, z in quad] for x in nv["x"]]
            loft(f"{n['id']}.vane.{k}", rings, vane, "Exterior", side)
    for bell in ext["engineBells"]:
        by, bz = bell["axis"]["y"], bell["axis"]["z"]
        side = "starboard" if by > 0 else "port"
        bx0, bx1 = bell["x"]
        rings = [circle(bx0, by, bz, bell["throatRadius"]), circle(bx1, by, bz, bell["exitRadius"])]
        loft(f"{bell['id']}.bell", rings, accent, "Exterior", side, caps=False, bevel=0.04)
        inner = [
            circle(bx0 + 0.3, by, bz, bell["throatRadius"] * 0.9),
            circle(bx1 - 0.05, by, bz, bell["exitRadius"] - 0.12),
        ]
        loft(f"{bell['id']}.inner", inner, dark, "Exterior", side, caps=False)
        loft(
            f"{bell['id']}.glow",
            [circle(bx0 + 0.6, by, bz, bell["throatRadius"] * 0.85)] * 2,
            glow,
            "Exterior",
            side,
        )

    # Louvred radiator panels in the reactor block's flanks.
    fl = ext["radiators"]["flankLouvres"]
    for sign, side in ((1, "starboard"), (-1, "port")):
        for k in range(int((fl["z"][1] - fl["z"][0]) / 0.9)):
            z = fl["z"][0] + 0.9 * k
            w = hull.half_width_at(sum(fl["x"]) / 2, z + 0.25)
            box_object(
                f"Louvre.{side}.{k}",
                fl["x"],
                sorted((sign * (w + 0.2), sign * (w + 0.32))),
                (z, z + 0.42),
                accent,
                "Exterior",
                side,
            )

    # Emitters and RCS quads, small and set into the plates.
    for em in ext["emitters"]:
        side = "port" if em["at"][1] < -0.5 else "starboard" if em["at"][1] > 0.5 else "centre"
        oriented(dome(f"{em['id']}", 0.55, 0.3, emitter, side), em["at"], em["normal"])
    for q in ext["rcsQuads"]:
        x, y, z = q["at"]
        side = "port" if y < 0 else "starboard"
        s = 1 if y > 0 else -1
        box_object(
            f"{q['id']}",
            (x - 0.5, x + 0.5),
            sorted((y - s * 0.2, y + s * 0.35)),
            (z - 0.4, z + 0.4),
            dark,
            "Exterior",
            side,
            bevel=0.08,
        )

    # Doors to space with hazard frames, and the markings.
    for door in geometry["doors"]:
        if "space" not in door["between"]:
            continue
        x0, x1 = door["x"]
        if door["kind"] == "bay-door":
            zb = hull.bottom_at((x0 + x1) / 2)
            box_object(
                f"Door.{door['id']}.frame",
                (x0 - 0.4, x1 + 0.4),
                (door["y"][0] - 0.4, door["y"][1] + 0.4),
                (zb - 0.08, zb + 0.02),
                hazard,
                "Exterior",
            )
            box_object(
                f"Door.{door['id']}", door["x"], door["y"], (zb - 0.12, zb + 0.02), dark, "Exterior"
            )
        else:
            sign = -1 if door["y"][0] < 0 else 1
            zc = sum(door["z"]) / 2
            w = hull.half_width_at(sum(door["x"]) / 2, zc) + 0.22
            side = "port" if sign < 0 else "starboard"
            box_object(
                f"Door.{door['id']}.frame",
                (x0 - 0.3, x1 + 0.3),
                sorted((sign * w, sign * (w + 0.06))),
                (door["z"][0] - 0.3, door["z"][1] + 0.3),
                hazard,
                "Exterior",
                side,
            )
            box_object(
                f"Door.{door['id']}",
                door["x"],
                sorted((sign * w, sign * (w + 0.1))),
                door["z"],
                dark,
                "Exterior",
                side,
            )
    ink = material("marking", "#1d2126", 0.1, 0.6)
    ink_light = material("marking-light", "#e8e6df", 0.1, 0.6)
    for k, mark in enumerate(ext["markings"]):
        x0, x1 = mark["x"]
        xc = (x0 + x1) / 2
        face = mark["face"]
        if face in ("port", "starboard"):
            sign = 1 if face == "starboard" else -1
            z = mark["z"]
            yaw = math.atan2(hull.half_width_at(x1, z) - hull.half_width_at(x0, z), x1 - x0)
            w = hull.half_width_at(xc, z) + 0.24
            rot = (math.radians(90), 0, math.pi + yaw) if sign > 0 else (math.radians(90), 0, -yaw)
            text_object(
                f"Marking.{k}", mark["text"], (xc, sign * w, z), 1.1, ink, "Exterior", rot, face
            )
        elif face == "dorsal":
            text_object(
                f"Marking.{k}",
                mark["text"],
                (xc, mark.get("y", 0), hull.top_at(xc) + 0.05),
                2.0,
                ink_light,
                "Exterior",
            )
        else:
            at = (xc, mark.get("y", 0), hull.bottom_at(xc) - 0.05)
            text_object(
                f"Marking.{k}", mark["text"], at, 1.8, ink_light, "Exterior", (math.pi, 0, 0)
            )


# --- the interior for the cutaway ---------------------------------------------------------


def build_interior(geometry, hull):
    label_mat = material("label", "#0e1013", 0.0, 0.8)
    door_mat = material("door", "#ffcc33", 0.1, 0.5)
    tank_mat = material("tank", "#6b7480", 0.5, 0.4)
    deck_mat = material("deck-plate", "#30353b", 0.3, 0.7)
    fixture_mat = material("fixture", "#6d737b", 0.2, 0.6)
    fixture_label = material("fixture-label", "#e6e8eb", 0.0, 0.8)
    for room in geometry["compartments"]:
        mat = material(f"room.{room['id']}", ROOM_COLOURS.get(room["id"], "#888888"), 0.0, 0.7)
        for k, box in enumerate(room["boxes"]):
            # The cutaway looks in from port, so each room shows its far wall
            # and its floor, and the fixtures stand in front of them.
            (x0, x1), (y0, y1), (z0, z1) = box["x"], box["y"], box["z"]
            xs, zs = (x0 + 0.07, x1 - 0.07), (z0 + 0.07, z1 - 0.07)
            box_object(f"Room.{room['id']}.{k}.wall", xs, (y1 - 0.2, y1), zs, mat, "Interior")
            box_object(
                f"Room.{room['id']}.{k}.floor", xs, (y0, y1), (z0, z0 + 0.06), mat, "Interior"
            )
        for f in room["fixtures"]:
            (x0, x1), (y0, y1), (z0, z1) = f["x"], f["y"], f["z"]
            if f["shape"] == "cylinder":
                cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
                ring = [
                    (
                        cx + rx * math.cos(2 * math.pi * j / 24),
                        cy + ry * math.sin(2 * math.pi * j / 24),
                    )
                    for j in range(24)
                ]
                rings = [[(x, y, z) for x, y in ring] for z in (z0, z1)]
                loft(f"Fixture.{f['id']}", rings, fixture_mat, "Interior")
            else:
                box_object(
                    f"Fixture.{f['id']}",
                    f["x"],
                    f["y"],
                    f["z"],
                    fixture_mat,
                    "Interior",
                    bevel=0.04,
                )
            at = ((x0 + x1) / 2, -10.45, z1 + 0.25)
            name = f["id"].split(".", 1)[1]
            text_object(
                f"Label.{f['id']}",
                name,
                at,
                0.36,
                fixture_label,
                "Interior",
                (math.radians(90), 0, 0),
            )
        big = max(room["boxes"], key=lambda b: (b["x"][1] - b["x"][0]) * (b["z"][1] - b["z"][0]))
        # Upper-deck labels sit above the railgun barrel, which crosses those rooms.
        drop = 0.55 if room["decks"] == ["upper"] else 1.0
        at = (sum(big["x"]) / 2, -10.5, big["z"][1] - drop)
        text_object(
            f"Label.{room['id']}",
            room["id"],
            at,
            0.75,
            label_mat,
            "Interior",
            (math.radians(90), 0, 0),
        )
    for door in geometry["doors"]:
        flat = [a for a in "xyz" if door[a][0] == door[a][1]][0]
        span = {a: list(door[a]) for a in "xyz"}
        span[flat] = [door[flat][0] - 0.18, door[flat][0] + 0.18]
        box_object(f"Door.{door['id']}.leaf", span["x"], span["y"], span["z"], door_mat, "Interior")
    for tank in geometry["tanks"]:
        (x0, x1), (y0, y1), (z0, z1) = tank["x"], tank["y"], tank["z"]
        r = min(z1 - z0, 2.4) / 2
        n = max(1, int((y1 - y0) // (2 * r + 0.2)))
        for k in range(n):
            yc = lerp(y0, y1, (k + 0.5) / n)
            side = "port" if yc < 0 else "starboard"
            loft(
                f"Tank.{tank['id']}.{k}",
                [circle(x, yc, (z0 + z1) / 2, r * 0.95, 20) for x in (x0, x1)],
                tank_mat,
                "Tanks",
                side,
            )
    for deck in geometry["decks"] + [{"floor": 11.2}]:
        level = deck["floor"]
        xs = [k * 0.5 for k in range(0, 2 * 72 + 1)]
        edge = [
            (x, hull.half_width_at(x, level) - 0.25)
            for x in xs
            if hull.half_width_at(x, level) > 0.5
        ]
        verts = [(x, -w, level) for x, w in edge] + [(x, w, level) for x, w in reversed(edge)]
        mesh_object(f"Deck.{level:g}", verts, [tuple(range(len(verts)))], deck_mat, "Interior")
    for conduit in geometry["conduits"]:
        mat = material(f"conduit.{conduit['kind']}", CONDUIT_COLOURS[conduit["kind"]], 0.1, 0.4)
        tube_object(f"Conduit.{conduit['id']}", conduit["path"], 0.11, mat, "Interior")


# --- views ------------------------------------------------------------------------------


def coll_of(obj):
    return obj.users_collection[0].name if obj.users_collection else ""


def set_visible(predicate):
    for obj in bpy.context.scene.objects:
        if obj.type in ("CAMERA", "LIGHT"):
            continue
        show = bool(predicate(obj))
        obj.hide_render = not show
        obj.hide_set(not show)


def camera(name, location, rotation, ortho_scale=None, lens=50):
    data = bpy.data.cameras.new(name)
    if ortho_scale is not None:
        data.type = "ORTHO"
        data.ortho_scale = ortho_scale
    else:
        data.lens = lens
    data.clip_end = 1000
    cam = bpy.data.objects.new(name, data)
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(cam)
    return cam


def workbench(scene, background="#11151a", flat=False):
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "FLAT" if flat else "STUDIO"
    shading.color_type = "SINGLE" if flat else "MATERIAL"
    shading.single_color = (0.02, 0.02, 0.02)
    shading.show_cavity = not flat
    shading.cavity_type = "BOTH"
    shading.show_object_outline = not flat
    shading.object_outline_color = (0.02, 0.02, 0.03)
    shading.show_specular_highlight = not flat
    # Workbench casts a label's shadow onto the rooms behind it, so no view
    # here uses shadows.
    shading.show_shadows = False
    scene.display.render_aa = "16"
    scene.render.film_transparent = False
    scene.world.color = hex_rgba(background)[:3]


def render(scene, cam, path, width, height):
    scene.camera = cam
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    # The date and the render time in the PNG metadata would make two runs
    # differ byte for byte, so the renders carry no stamp fields.
    for field in (
        "date",
        "time",
        "render_time",
        "frame",
        "memory",
        "hostname",
        "camera",
        "lens",
        "scene",
        "filename",
    ):
        if hasattr(scene.render, f"use_stamp_{field}"):
            setattr(scene.render, f"use_stamp_{field}", False)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"meridian-ship: wrote {path}")


def exterior_only(obj):
    return coll_of(obj) in ("Hull", "Exterior")


SIDE_CAM = ((35.0, -150, 7.5), (math.radians(90), 0, 0), 80)
TOP_CAM = ((35.0, 0, 150), (0, 0, 0), 80)


def view_side(scene, out, width, name="sv01-side.png", flat=False):
    workbench(scene, "#ffffff" if flat else "#11151a", flat)
    set_visible(exterior_only)
    loc, rot, scale = SIDE_CAM
    render(
        scene,
        camera("Cam.side", loc, rot, scale),
        os.path.join(out, name),
        width,
        int(width * 0.25),
    )


def view_top(scene, out, width, name="sv01-top.png", flat=False):
    workbench(scene, "#ffffff" if flat else "#11151a", flat)
    set_visible(exterior_only)
    loc, rot, scale = TOP_CAM
    render(
        scene, camera("Cam.top", loc, rot, scale), os.path.join(out, name), width, int(width * 0.36)
    )


def view_cutaway(scene, out, width):
    workbench(scene)

    def show(obj):
        c = coll_of(obj)
        if c == "Interior":
            return True
        if c == "Tanks":
            return "storm" not in obj.name
        return c in ("Hull", "Exterior") and obj["side"] != "port"

    set_visible(show)
    loc, rot, scale = SIDE_CAM
    # The cutaway carries every room id, so it renders at 1.5 times the width.
    w = int(width * 1.5)
    render(
        scene,
        camera("Cam.cutaway", loc, rot, scale),
        os.path.join(out, "sv01-cutaway.png"),
        w,
        int(w * 0.25),
    )


def engine_id(preferred):
    items = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    return next((name for name in preferred if name in items), "BLENDER_WORKBENCH")


def view_hero(scene, out, width):
    set_visible(exterior_only)
    scene.render.engine = engine_id(("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"))
    if scene.render.engine == "BLENDER_WORKBENCH":
        workbench(scene)
    else:
        if hasattr(scene, "eevee"):
            scene.eevee.taa_render_samples = 48
        world = scene.world
        if world.node_tree is None and hasattr(world, "use_nodes"):
            world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg is not None:
            # A faint blue-grey fill, so the shadowed flanks keep their plates.
            bg.inputs["Color"].default_value = hex_rgba("#2a3340")
            bg.inputs["Strength"].default_value = 0.35
        # Each light is given by the direction it travels.
        for name, travel, energy, colour in (
            ("Sun.key", (0.35, -0.75, -0.55), 4.5, "#fff1dc"),
            ("Sun.rim", (0.2, 0.85, -0.25), 2.0, "#9ec8ff"),
        ):
            light = bpy.data.lights.new(name, "SUN")
            light.energy = energy
            light.color = hex_rgba(colour)[:3]
            obj = bpy.data.objects.new(name, light)
            obj.rotation_mode = "QUATERNION"
            obj.rotation_quaternion = Vector(travel).normalized().to_track_quat("-Z", "Y")
            scene.collection.objects.link(obj)
        scene.view_settings.view_transform = "AgX"
    target, loc = Vector((36, 0, 5)), Vector((-24, 58, 30))
    cam = camera("Cam.hero", tuple(loc), (0, 0, 0), lens=40)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (target - loc).to_track_quat("-Z", "Y")
    render(scene, cam, os.path.join(out, "sv01-hero.png"), width, int(width * 9 / 16))


# --- entry point ------------------------------------------------------------------------


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build_ship.py")
    parser.add_argument("--geometry", default=DEFAULT_GEOMETRY)
    parser.add_argument("--out", required=True, help="directory for the renders and SVGs")
    parser.add_argument("--views", default=",".join(VIEWS))
    parser.add_argument("--width", type=int, default=2048)
    parser.add_argument("--prefix", default="", help="prefix for the silhouette files")
    parser.add_argument("--blend", help="save the scene as this .blend file")
    return parser.parse_args(argv)


def main():
    args = parse_args()
    geometry = load(args.geometry)
    views = [v for v in args.views.split(",") if v]
    unknown = [v for v in views if v not in VIEWS]
    if unknown:
        raise SystemExit(f"unknown views {unknown}; choose from {', '.join(VIEWS)}")
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    hull = Hull(geometry["hull"])
    build_hull(geometry, hull)
    build_exterior(geometry, hull)
    build_interior(geometry, hull)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
        print(f"meridian-ship: wrote {args.blend}")
    # The hero changes the render engine and adds lights, so it runs last.
    for view in sorted(views, key=lambda v: v == "hero"):
        if view == "side":
            view_side(scene, args.out, args.width)
        elif view == "top":
            view_top(scene, args.out, args.width)
        elif view == "silhouette":
            view_side(scene, args.out, 1200, f"{args.prefix}silhouette-side.png", flat=True)
            view_top(scene, args.out, 1200, f"{args.prefix}silhouette-top.png", flat=True)
        elif view == "cutaway":
            view_cutaway(scene, args.out, args.width)
        elif view == "hero":
            view_hero(scene, args.out, args.width)
        elif view == "svg":
            export_svgs(geometry, args.out)


if __name__ == "__main__":
    main()
