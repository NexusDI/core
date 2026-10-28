"""Build the SV-01 Meridian concept mesh from the ship geometry and render it.

Run inside Blender (5.2 or later), in the background:

    blender --background --factory-startup --python tools/meridian-ship/build_ship.py -- \
        --out <dir> [--views side,top,hero,cutaway,decks] [--width 2048] [--blend <file>]

The script reads examples/meridian-systems/deck/meridian.geometry.json, the one
layout the simulation's deck view also draws from. Ship axes map straight onto
Blender's: x runs aft from the bow, y to starboard and z up from the ventral
skin, in metres. Every random choice draws from one seeded generator, so the
same geometry file gives the same mesh and the same renders.
"""

import argparse
import colorsys
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DEFAULT_GEOMETRY = os.path.join(
    REPO, "examples", "meridian-systems", "deck", "meridian.geometry.json"
)
SEED = 211
VIEWS = ("side", "top", "hero", "cutaway", "decks")

# One colour per compartment for the cutaway and the deck plans. A room the
# table lacks gets a colour from its id.
ROOM_COLOURS = {
    "bridge": "#3f7fd9",
    "chart-room": "#5fb3e8",
    "computer-core": "#8c6bd6",
    "habitat": "#3fae7c",
    "quarters": "#8fd16a",
    "comms-relay": "#c07fd6",
    "airlock": "#f08a2b",
    "shuttle-bay": "#c9b44a",
    "drone-bay": "#9e8a3a",
    "capacitor-room": "#e0567a",
    "engineering": "#d9683f",
    "ftl-core": "#5ad6c8",
    "reactor-bay": "#c23b2e",
    "main-drive": "#e8a33d",
}
CONDUIT_COLOURS = {"power": "#ffcc33", "coolant": "#33d6ff", "atmosphere": "#b6f07a"}
HULL_LIGHT = "#b9bcbf"
HULL_MID = "#8e9399"
HULL_DARK = "#4a4f55"
HAZARD = "#f2b705"


# --- small helpers -------------------------------------------------------


def hex_rgba(value, alpha=1.0):
    value = value.lstrip("#")
    r, g, b = (int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))
    # Blender colours are linear; the hex values are sRGB.
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    return (*lin, alpha)


def id_colour(name):
    h = sum(ord(c) * (i + 1) for i, c in enumerate(name)) % 360 / 360
    r, g, b = colorsys.hsv_to_rgb(h, 0.55, 0.85)
    return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def lerp(a, b, t):
    return a + (b - a) * t


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


def collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def link(obj, coll_name, side="centre", decks=()):
    """Links `obj` and tags it with the hull side it sits on and the decks it shows on."""
    collection(coll_name).objects.link(obj)
    obj["side"] = side
    obj["decks"] = ",".join(decks)
    return obj


def mesh_object(name, verts, faces, mat, coll, side="centre", decks=(), mats=None, face_mats=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    me.update()
    obj = bpy.data.objects.new(name, me)
    for m in mats or [mat]:
        me.materials.append(m)
    if face_mats:
        for poly, index in zip(me.polygons, face_mats):
            poly.material_index = index
    return link(obj, coll, side, decks)


def box_object(name, x, y, z, mat, coll, side=None, decks=(), inset=0.0):
    x0, x1 = x[0] + inset, x[1] - inset
    y0, y1 = y[0] + inset, y[1] - inset
    z0, z1 = z[0] + inset, z[1] - inset
    verts = [
        (x0, y0, z0),
        (x1, y0, z0),
        (x1, y1, z0),
        (x0, y1, z0),
        (x0, y0, z1),
        (x1, y0, z1),
        (x1, y1, z1),
        (x0, y1, z1),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if side is None:
        side = "port" if y1 < 0 else "starboard" if y0 > 0 else "centre"
    return mesh_object(name, verts, faces, mat, coll, side, decks)


def loft(name, rings, mat, coll, side="centre", cap_start=True, cap_end=True, closed=True):
    """Joins rings of equal length into one surface; a closed ring wraps round."""
    verts = [v for ring in rings for v in ring]
    n = len(rings[0])
    faces = []
    span = n if closed else n - 1
    for r in range(len(rings) - 1):
        for k in range(span):
            a = r * n + k
            b = r * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap_start:
        faces.append(tuple(reversed(range(n))))
    if cap_end:
        last = (len(rings) - 1) * n
        faces.append(tuple(range(last, last + n)))
    return mesh_object(name, verts, faces, mat, coll, side)


def text_object(name, body, at, size, mat, coll, rotation=(0, 0, 0), side="centre", decks=()):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.01
    obj = bpy.data.objects.new(name, curve)
    obj.location = at
    obj.rotation_euler = rotation
    curve.materials.append(mat)
    return link(obj, coll, side, decks)


def tube_object(name, points, radius, mat, coll, side="centre", decks=()):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (co[0], co[1], co[2], 1.0)
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(mat)
    return link(obj, coll, side, decks)


def cylinder_x(name, x0, x1, y, z, r0, r1, mat, coll, segments=32, side="centre", open_ends=False):
    """A cone or cylinder along the x axis from radius r0 at x0 to r1 at x1."""
    rings = []
    for x, r in ((x0, r0), (x1, r1)):
        rings.append(
            [
                (
                    x,
                    y + r * math.cos(2 * math.pi * k / segments),
                    z + r * math.sin(2 * math.pi * k / segments),
                )
                for k in range(segments)
            ]
        )
    return loft(name, rings, mat, coll, side, cap_start=not open_ends, cap_end=not open_ends)


def cylinder_z(name, x, y, z0, z1, r, mat, coll, segments=16, side="centre"):
    rings = [
        [
            (
                x + r * math.cos(2 * math.pi * k / segments),
                y + r * math.sin(2 * math.pi * k / segments),
                z,
            )
            for k in range(segments)
        ]
        for z in (z0, z1)
    ]
    return loft(name, rings, mat, coll, side)


def segment_between(name, a, b, r, mat, coll, side="centre"):
    """A strut from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    obj = cylinder_z(name, 0, 0, 0, length, r, mat, coll, segments=8, side=side)
    obj.location = a
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return obj


# --- the hull envelope ------------------------------------------------------


class Hull:
    def __init__(self, hull):
        self.stations = hull["stations"]
        self.skin = hull["skin"]

    def params(self, x):
        st = self.stations
        x = min(max(x, st[0]["x"]), st[-1]["x"])
        for a, b in zip(st, st[1:]):
            if x <= b["x"]:
                t = (x - a["x"]) / (b["x"] - a["x"])
                return {
                    "w": lerp(a["halfBeam"], b["halfBeam"], t),
                    "bottom": lerp(a["bottom"], b["bottom"], t),
                    "top": lerp(a["top"], b["top"], t),
                    "bdy": lerp(a["chamferBottom"][0], b["chamferBottom"][0], t),
                    "bdz": lerp(a["chamferBottom"][1], b["chamferBottom"][1], t),
                    "tdy": lerp(a["chamferTop"][0], b["chamferTop"][0], t),
                    "tdz": lerp(a["chamferTop"][1], b["chamferTop"][1], t),
                }
        raise ValueError(x)

    def half_profile(self, x, sign):
        """The hull's outline at x on one side, from the keel centreline to the dorsal one."""
        p = self.params(x)
        w, bot, top = p["w"], p["bottom"], p["top"]
        pts = [
            (0.0, bot),
            ((w - p["bdy"]) * 0.5, bot),
            (w - p["bdy"], bot),
            (w, bot + p["bdz"]),
            (w, 4.8),
            (w, 8.0),
            (w, top - p["tdz"]),
            (w - p["tdy"], top),
            ((w - p["tdy"]) * 0.5, top),
            (0.0, top),
        ]
        return [(x, sign * y, z) for y, z in pts]

    def half_width_at(self, x, z):
        """The hull's half beam at height z, or 0 outside the section."""
        p = self.params(x)
        w, bot, top = p["w"], p["bottom"], p["top"]
        if z < bot or z > top:
            return 0.0
        if z < bot + p["bdz"]:
            return (w - p["bdy"]) + p["bdy"] * (z - bot) / p["bdz"]
        if z > top - p["tdz"]:
            return w - p["tdy"] * (z - (top - p["tdz"])) / p["tdz"]
        return w


def panel_breaks(geometry):
    """Panel seams along x: every station, every room boundary, and no panel longer than 4.5 m."""
    xs = {s["x"] for s in geometry["hull"]["stations"]}
    for room in geometry["compartments"]:
        for box in room["boxes"]:
            xs.update(box["x"])
    xs = sorted(x for x in xs if 0 <= x <= geometry["hull"]["stations"][-1]["x"])
    out = [xs[0]]
    for a, b in zip(xs, xs[1:]):
        if b - a < 0.6:
            continue
        n = max(1, math.ceil((b - a) / 4.5))
        out.extend(a + (b - a) * k / n for k in range(1, n + 1))
    return out


def build_hull(geometry, hull, rng):
    light = material("hull-light", HULL_LIGHT, 0.15, 0.5)
    mid = material("hull-mid", HULL_MID, 0.15, 0.55)
    dark = material("hull-dark", HULL_DARK, 0.25, 0.6)
    breaks = panel_breaks(geometry)
    for sign, side in ((1, "starboard"), (-1, "port")):
        verts, faces, face_mats = [], [], []
        gap = 0.04
        for i, (x0, x1) in enumerate(zip(breaks, breaks[1:])):
            a = hull.half_profile(x0 + (gap if i else 0), sign)
            b = hull.half_profile(x1 - (gap if x1 < breaks[-1] else 0), sign)
            base = len(verts)
            verts.extend(a + b)
            n = len(a)
            for k in range(n - 1):
                f = (base + k, base + n + k, base + n + k + 1, base + k + 1)
                faces.append(f if sign > 0 else tuple(reversed(f)))
                # The flanks take the light grey, the chamfers and the
                # belly the mid grey, and a few panels a darker plate.
                tone = 0 if k in (4, 5) else 1
                if rng.random() < 0.06:
                    tone = 2
                face_mats.append(tone)
        # The bow and stern faces.
        bow = hull.half_profile(breaks[0], sign)
        stern = hull.half_profile(breaks[-1], sign)
        for ring, flip in ((bow, sign > 0), (stern, sign < 0)):
            base = len(verts)
            verts.extend(ring)
            f = tuple(range(base, base + len(ring)))
            faces.append(tuple(reversed(f)) if flip else f)
            face_mats.append(2)
        obj = mesh_object(
            f"Hull.{side}",
            verts,
            faces,
            light,
            "Hull",
            side,
            mats=[light, mid, dark],
            face_mats=face_mats,
        )
        # Inset every panel and raise it, so each panel reads as a plate with a seam round it.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.inset_individual(bm, faces=list(bm.faces), thickness=0.05, depth=0.03)
        bm.to_mesh(obj.data)
        bm.free()

    # Layered armour: heavier slabs over the reactor bay and the drive, and
    # strakes along the engineering and bay band.
    slabs = [
        (43.2, 55.3, 2.4, 11.0, 0.22),
        (28.2, 40.8, 5.0, 7.8, 0.12),
        (56.8, 64.8, 4.6, 8.0, 0.14),
    ]
    for x0, x1, z0, z1, t in slabs:
        for sign, side in ((1, "starboard"), (-1, "port")):
            rings = []
            for x in (x0, x1):
                w = hull.half_width_at(x, (z0 + z1) / 2)
                rings.append(
                    [
                        (x, sign * (w + t), z0),
                        (x, sign * (w + t), z1),
                        (x, sign * w, z1),
                        (x, sign * w, z0),
                    ]
                )
            loft(f"Armour.{side}.{x0:g}", rings, mid, "Hull", side)

    # Access plates and vents, placed from the seeded generator.
    for k in range(90):
        x = rng.uniform(4, 64)
        sign = rng.choice((1, -1))
        side = "starboard" if sign > 0 else "port"
        p = hull.params(x)
        if rng.random() < 0.55:
            z = rng.uniform(p["bottom"] + p["bdz"] + 0.4, p["top"] - p["tdz"] - 0.4)
            w = hull.half_width_at(x, z)
            sx, sz = rng.uniform(0.5, 1.8), rng.uniform(0.3, 0.9)
            box_object(
                f"Plate.{k}",
                (x, x + sx),
                sorted((sign * w, sign * (w + 0.07))),
                (z, z + sz),
                dark if rng.random() < 0.5 else mid,
                "Hull",
                side,
            )
        else:
            y = sign * rng.uniform(0.8, max(1.0, p["w"] - p["tdy"] - 0.6))
            sx, sy = rng.uniform(0.6, 2.2), rng.uniform(0.4, 1.2)
            box_object(
                f"Plate.{k}",
                (x, x + sx),
                sorted((y, y + sign * sy)),
                (p["top"] - 0.02, p["top"] + 0.06),
                dark,
                "Hull",
                side,
            )


# --- the exterior ------------------------------------------------------------


def build_exterior(geometry, hull, rng):
    ext = geometry["exterior"]
    dark = material("hull-dark", HULL_DARK)
    mid = material("hull-mid", HULL_MID)
    light = material("hull-light", HULL_LIGHT)
    glass = material("window", "#1d2a33", 0.1, 0.15, emission="#ffb35c", strength=2.5)
    hazard = material("hazard", HAZARD, 0.1, 0.6)
    black = material("hazard-black", "#1b1b1b", 0.1, 0.7)
    glow = material("exhaust", "#9fe9ff", 0.0, 0.3, emission="#7fdcff", strength=12.0)
    emitter_mat = material("emitter", "#6fa8c8", 0.6, 0.25, emission="#5fd0ff", strength=1.5)
    radiator = material("radiator", "#5d4a44", 0.5, 0.45, emission="#ff5a2a", strength=0.25)
    rib = material("radiator-rib", "#2d2f33", 0.6, 0.5)

    # Window band in the bow face, wrapping onto the bow flanks.
    band = ext["windowBand"]
    z0, z1 = band["z"]
    box_object("Windows.face", (-0.06, 0.04), band["y"], (z0, z1), glass, "Exterior")
    for sign, side in ((1, "starboard"), (-1, "port")):
        rings = []
        for x in (0.25, band["x"][1]):
            w = hull.half_width_at(x, (z0 + z1) / 2) + 0.03
            rings.append([(x, sign * w, z0), (x, sign * w, z1)])
        verts = rings[0] + rings[1]
        faces = [(0, 2, 3, 1) if sign > 0 else (0, 1, 3, 2)]
        mesh_object(f"Windows.{side}", verts, faces, glass, "Exterior", side)
    # Mullions across the band.
    for y in [k * 0.85 for k in range(-4, 5)]:
        box_object(
            f"Mullion.{y:g}", (-0.12, 0.06), (y - 0.06, y + 0.06), (z0, z1), dark, "Exterior"
        )
    # The brow: one curved visor over the window band, the hull's one curve.
    w = band["y"][1] + 0.9
    arc = []
    for k in range(13):
        a = math.radians(lerp(95, 190, k / 12))
        arc.append((1.6 + 2.0 * math.cos(a), 7.4 + 1.4 * math.sin(a)))
    outer = [(x, z) for x, z in arc]
    inner = [(lerp(1.6, x, 0.82), lerp(7.4, z, 0.82)) for x, z in arc]
    profile = outer + list(reversed(inner))
    rings = [[(x, y, z) for x, z in profile] for y in (-w, w)]
    loft("Brow", rings, mid, "Exterior")

    # The railgun: barrel, muzzle collar, shroud along the ridge and the breech hump.
    rg = ext["railgun"]
    ay, az = rg["axis"]["y"], rg["axis"]["z"]
    cylinder_x(
        "Railgun.barrel",
        rg["x"][0] - 0.2,
        rg["x"][1],
        ay,
        az,
        rg["boreRadius"],
        rg["boreRadius"],
        dark,
        "Exterior",
    )
    cylinder_x("Railgun.collar", -0.35, 0.5, ay, az, 0.85, 0.75, mid, "Exterior")
    cylinder_x("Railgun.bore", -0.4, -0.3, ay, az, 0.32, 0.32, black, "Exterior")
    sh = rg["shroud"]
    shroud_rings = []
    for x, top, hw in (
        (sh["x"][0], hull.params(sh["x"][0])["top"] + 0.35, 0.9),
        (4.5, sh["top"] - 0.4, sh["halfWidth"]),
        (9, sh["top"], sh["halfWidth"]),
        (sh["x"][1], sh["top"], sh["halfWidth"]),
    ):
        bot = hull.params(x)["top"] - 0.3
        c = 0.35
        shroud_rings.append(
            [
                (x, -hw, bot),
                (x, hw, bot),
                (x, hw, top - c),
                (x, hw - c, top),
                (x, -hw + c, top),
                (x, -hw, top - c),
            ]
        )
    loft("Railgun.shroud", shroud_rings, mid, "Exterior")
    hump = rg["breechHump"]
    hump_rings = []
    for x, top, hw in (
        (hump["x"][0], sh["top"], sh["halfWidth"] + 0.2),
        (hump["x"][0] + 2.0, hump["top"], hump["halfWidth"]),
        (hump["x"][1] - 1.5, hump["top"], hump["halfWidth"]),
        (hump["x"][1], hump["top"] - 0.7, hump["halfWidth"] - 0.6),
    ):
        bot = hull.params(x)["top"] - 0.3
        c = 0.5
        hump_rings.append(
            [
                (x, -hw, bot),
                (x, hw, bot),
                (x, hw, top - c),
                (x, hw - c, top),
                (x, -hw + c, top),
                (x, -hw, top - c),
            ]
        )
    loft("Railgun.hump", hump_rings, light, "Exterior")
    # Ribs across the shroud.
    for x in range(6, 28, 3):
        box_object(
            f"Shroud.rib.{x}",
            (x, x + 0.35),
            (-sh["halfWidth"] - 0.08, sh["halfWidth"] + 0.08),
            (sh["top"] - 0.9, sh["top"] + 0.06),
            dark,
            "Exterior",
        )

    # Masts.
    for mast in ext["masts"]:
        x0, x1 = mast["x"]
        xc = (x0 + x1) / 2
        y = mast["y"]
        side = "starboard" if y > 0 else "port"
        base, top = mast["base"], mast["base"] + mast["height"]
        if "array" in mast:
            box_object(
                f"{mast['id']}.pylon",
                (xc - 0.7, xc + 0.7),
                (y - 0.5, y + 0.5),
                (base - 0.2, top),
                dark,
                "Exterior",
                side,
            )
            box_object(
                f"{mast['id']}.foot",
                (x0, x1),
                (y - 1.1, y + 1.1),
                (base - 0.2, base + 0.5),
                mid,
                "Exterior",
                side,
            )
            arr = mast["array"]
            panel = box_object(
                f"{mast['id']}.array",
                (-arr["width"] / 2, arr["width"] / 2),
                (-arr["height"] / 2, arr["height"] / 2),
                (-0.12, 0.12),
                light,
                "Exterior",
                side,
            )
            panel.location = (xc, y + 0.3, top + 0.4)
            panel.rotation_euler = (math.radians(18), 0, 0)
            for k in range(-3, 4):
                tile = box_object(
                    f"{mast['id']}.tile.{k}",
                    (k * 1.1 - 0.45, k * 1.1 + 0.45),
                    (-1.7, 1.7),
                    (0.12, 0.16),
                    dark,
                    "Exterior",
                    side,
                )
                tile.location = panel.location
                tile.rotation_euler = panel.rotation_euler
        else:
            cylinder_z(
                f"{mast['id']}.pole", xc, y, base - 0.2, top, 0.16, dark, "Exterior", side=side
            )
            cylinder_z(
                f"{mast['id']}.pod", xc, y, top - 1.6, top - 0.6, 0.45, light, "Exterior", side=side
            )
            box_object(
                f"{mast['id']}.yard",
                (xc - 0.08, xc + 0.08),
                (y - 1.4, y + 1.4),
                (top - 2.6, top - 2.45),
                dark,
                "Exterior",
                side,
            )

    # Radiator wings, deployed, with ribs, a hinge housing and root struts.
    for wing in ext["radiatorWings"]:
        sign = 1 if wing["root"]["y"] > 0 else -1
        side = wing["side"]
        z = wing["z"]
        t = wing["thickness"] / 2
        ry, ty = wing["root"]["y"], wing["tip"]["y"]
        outline = [
            (wing["root"]["x"][0], ry),
            (wing["tip"]["x"][0], ty),
            (wing["tip"]["x"][1], ty),
            (wing["root"]["x"][1], ry),
        ]
        if sign < 0:
            outline = list(reversed(outline))
        verts = [(x, y, z - t) for x, y in outline] + [(x, y, z + t) for x, y in outline]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        mesh_object(f"Wing.{side}", verts, faces, radiator, "Exterior", side)
        span = abs(ty - ry)
        le = (wing["tip"]["x"][0] - wing["root"]["x"][0]) / span
        te = (wing["tip"]["x"][1] - wing["root"]["x"][1]) / span
        for k in range(1, 16):
            d = span * k / 16
            y = ry + sign * d
            xa = wing["root"]["x"][0] + le * d
            xb = wing["root"]["x"][1] + te * d
            for zz, name in ((z + t, "top"), (z - t - 0.08, "bottom")):
                box_object(
                    f"Wing.{side}.rib.{k}.{name}",
                    (xa, xb),
                    (y - 0.09, y + 0.09),
                    (zz, zz + 0.08),
                    rib,
                    "Exterior",
                    side,
                )
        # Leading and trailing edge spars.
        for xs, name in ((0, "le"), (1, "te")):
            a = (wing["root"]["x"][xs], ry, z)
            b = (wing["tip"]["x"][xs], ty, z)
            segment_between(f"Wing.{side}.spar.{name}", a, b, 0.28, rib, "Exterior", side)
        box_object(
            f"Wing.{side}.hinge",
            (wing["root"]["x"][0] - 0.4, wing["root"]["x"][1] + 0.4),
            sorted((ry - sign * 0.3, ry + sign * 1.4)),
            (z - 0.7, z + 0.7),
            dark,
            "Exterior",
            side,
        )
        # An exposed truss at the root, in the wing's plane: two rails and
        # the diagonals between them, thin from the side and open from above.
        zt = z + t + 0.25

        def rail_x(d, u, root=wing["root"]["x"], le=le, te=te):
            """The x at distance d outboard of the root, a fraction u along the chord."""
            return lerp(root[0] + le * d + 0.8, root[1] + te * d - 0.8, u)

        for k, d in enumerate((1.4, 4.0)):
            y_rail = ry + sign * d
            segment_between(
                f"Wing.{side}.rail.{k}",
                (rail_x(d, 0), y_rail, zt),
                (rail_x(d, 1), y_rail, zt),
                0.16,
                dark,
                "Exterior",
                side,
            )
        for k in range(6):
            u0, u1 = (k / 6, (k + 1) / 6) if k % 2 == 0 else ((k + 1) / 6, k / 6)
            a = (rail_x(1.4, u0), ry + sign * 1.4, zt)
            b = (rail_x(4.0, u1), ry + sign * 4.0, zt)
            segment_between(f"Wing.{side}.brace.{k}", a, b, 0.1, dark, "Exterior", side)

    # Deflector emitters.
    for em in ext["emitters"]:
        x, y, z = em["at"]
        nx, ny, nz = em["normal"]
        side = "port" if y < -0.5 else "starboard" if y > 0.5 else "centre"
        base = cylinder_z(f"{em['id']}.base", 0, 0, -0.3, 0.25, 0.75, dark, "Exterior", side=side)
        dome = cylinder_z(
            f"{em['id']}.dome", 0, 0, 0.25, 0.65, 0.5, emitter_mat, "Exterior", side=side
        )
        for obj in (base, dome):
            obj.location = (x, y, z)
            obj.rotation_mode = "QUATERNION"
            obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((nx, ny, nz)))

    # RCS quads: a block with four nozzles.
    for q in ext["rcsQuads"]:
        x, y, z = q["at"]
        side = "port" if y < 0 else "starboard"
        sign = -1 if y < 0 else 1
        box_object(
            f"{q['id']}.block",
            (x - 0.55, x + 0.55),
            sorted((y - sign * 0.3, y + sign * 0.55)),
            (z - 0.55, z + 0.55),
            dark,
            "Exterior",
            side,
        )
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            segment_between(
                f"{q['id']}.nozzle.{dx}{dz}",
                (x + dx * 0.5, y + sign * 0.2, z + dz * 0.5),
                (x + dx * 0.85, y + sign * 0.2, z + dz * 0.85),
                0.16,
                black,
                "Exterior",
                side,
            )

    # Main engines: a mount block, two bells and the exhaust glow.
    bells = ext["engineBells"]
    bx0 = min(b["x"][0] for b in bells)
    mount_rings = []
    for x, w, h in ((hull.stations[-1]["x"] - 0.2, 4.8, 2.8), (bx0 + 1.9, 4.5, 2.5)):
        mount_rings.append([(x, -w, 6.4 - h), (x, w, 6.4 - h), (x, w, 6.4 + h), (x, -w, 6.4 + h)])
    loft("Engine.mount", mount_rings, dark, "Exterior")
    for b in bells:
        y, z = b["axis"]["y"], b["axis"]["z"]
        side = "starboard" if y > 0 else "port"
        cylinder_x(
            f"{b['id']}.outer",
            b["x"][0],
            b["x"][1],
            y,
            z,
            b["throatRadius"] + 0.15,
            b["exitRadius"],
            mid,
            "Exterior",
            side=side,
            open_ends=True,
        )
        cylinder_x(
            f"{b['id']}.inner",
            b["x"][0] + 0.2,
            b["x"][1] - 0.02,
            y,
            z,
            b["throatRadius"],
            b["exitRadius"] - 0.1,
            black,
            "Exterior",
            side=side,
            open_ends=True,
        )
        cylinder_x(
            f"{b['id']}.ring",
            b["x"][1] - 0.35,
            b["x"][1],
            y,
            z,
            b["exitRadius"] + 0.12,
            b["exitRadius"] + 0.12,
            dark,
            "Exterior",
            side=side,
            open_ends=True,
        )
        cylinder_x(
            f"{b['id']}.glow",
            b["x"][0] + 0.6,
            b["x"][0] + 0.7,
            y,
            z,
            b["throatRadius"] * 1.05,
            b["throatRadius"] * 1.05,
            glow,
            "Exterior",
            side=side,
        )

    # Doors to space: ventral bay doors with hazard banding, and the airlock hatch.
    for door in geometry["doors"]:
        if "space" not in door["between"]:
            continue
        x0, x1 = door["x"]
        if door["kind"] == "bay-door":
            y0, y1 = door["y"]
            zb = hull.params((x0 + x1) / 2)["bottom"]
            box_object(
                f"Door.{door['id']}", (x0, x1), (y0, y1), (zb - 0.1, zb + 0.02), dark, "Exterior"
            )
            box_object(
                f"Door.{door['id']}.seam",
                ((x0 + x1) / 2 - 0.05, (x0 + x1) / 2 + 0.05),
                (y0, y1),
                (zb - 0.14, zb - 0.08),
                black,
                "Exterior",
            )
            hazard_frame(
                f"Door.{door['id']}",
                (x0 - 0.5, x1 + 0.5),
                (y0 - 0.5, y1 + 0.5),
                zb - 0.12,
                hazard,
                black,
            )
        else:
            yd = door["y"][0]
            sign = -1 if yd < 0 else 1
            side = "port" if sign < 0 else "starboard"
            z0, z1 = door["z"]
            w = hull.half_width_at((x0 + x1) / 2, (z0 + z1) / 2)
            box_object(
                f"Door.{door['id']}",
                (x0, x1),
                sorted((sign * w, sign * (w + 0.1))),
                (z0, z1),
                dark,
                "Exterior",
                side,
            )
            for k, (fx, fz) in enumerate(
                (
                    ((x0 - 0.35, x0), (z0 - 0.35, z1 + 0.35)),
                    ((x1, x1 + 0.35), (z0 - 0.35, z1 + 0.35)),
                    ((x0, x1), (z1, z1 + 0.35)),
                    ((x0, x1), (z0 - 0.35, z0)),
                )
            ):
                box_object(
                    f"Door.{door['id']}.frame.{k}",
                    fx,
                    sorted((sign * w, sign * (w + 0.14))),
                    fz,
                    hazard,
                    "Exterior",
                    side,
                )

    # Small windows where a crew room meets the flank.
    for room in geometry["compartments"]:
        if room["id"] not in ("habitat", "quarters", "chart-room"):
            continue
        for box in room["boxes"]:
            for edge, sign in ((box["y"][1], 1), (box["y"][0], -1)):
                xs = [x for x in frange(box["x"][0] + 1.0, box["x"][1] - 1.0, 2.0)]
                for x in xs:
                    zf = box["z"][0] + 1.4
                    w = hull.half_width_at(x, zf)
                    if sign * edge < 0 or w - abs(edge) > 1.6:
                        continue
                    side = "starboard" if sign > 0 else "port"
                    box_object(
                        f"Window.{room['id']}.{x:g}.{sign}",
                        (x, x + 0.9),
                        sorted((sign * w, sign * (w + 0.05))),
                        (zf, zf + 0.35),
                        glass,
                        "Exterior",
                        side,
                    )

    # Markings.
    ink = material("marking", "#e8e6df", 0.1, 0.6)
    ink_dark = material("marking-dark", "#2a2c30", 0.1, 0.6)
    for k, mark in enumerate(geometry["exterior"]["markings"]):
        x0, x1 = mark["x"]
        xc = (x0 + x1) / 2
        size = 1.5 if mark["text"] == "MERIDIAN" else 1.3
        face = mark["face"]
        if face in ("port", "starboard"):
            sign = 1 if face == "starboard" else -1
            z = mark["z"]
            wa, wb = hull.half_width_at(x0, z), hull.half_width_at(x1, z)
            yaw = math.atan2(wb - wa, x1 - x0)
            # Clear of the access plates, which stand 0.07 m proud.
            w = hull.half_width_at(xc, z) + 0.12
            # A text faces +z; stand it up to face out of the flank.
            if sign > 0:
                rot = (math.radians(90), 0, math.pi + yaw)
            else:
                rot = (math.radians(90), 0, -yaw)
            text_object(
                f"Marking.{k}",
                mark["text"],
                (xc, sign * w, z),
                size,
                ink_dark,
                "Exterior",
                rot,
                face,
            )
        elif face == "dorsal":
            z = hull.params(xc)["top"] + 0.05
            text_object(
                f"Marking.{k}",
                mark["text"],
                (xc, mark.get("y", 0), z),
                2.0,
                ink,
                "Exterior",
                (0, 0, 0),
            )
        else:
            z = hull.params(xc)["bottom"] - 0.05
            text_object(
                f"Marking.{k}",
                mark["text"],
                (xc, mark.get("y", 0), z),
                1.8,
                ink,
                "Exterior",
                (math.pi, 0, 0),
            )


def frange(a, b, step):
    out = []
    x = a
    while x <= b + 1e-9:
        out.append(round(x, 6))
        x += step
    return out


def hazard_frame(name, x, y, z, hazard, black):
    """Yellow and black blocks round a rectangle on the ventral skin."""
    (x0, x1), (y0, y1) = x, y
    size = 0.6
    k = 0
    for xa in frange(x0, x1 - size, size):
        for yy in (y0, y1 - 0.4):
            box_object(
                f"{name}.hz.{k}",
                (xa, xa + size),
                (yy, yy + 0.4),
                (z - 0.04, z),
                hazard if k % 2 == 0 else black,
                "Exterior",
            )
            k += 1
    for ya in frange(y0 + 0.4, y1 - 0.4 - size, size):
        for xx in (x0, x1 - 0.4):
            box_object(
                f"{name}.hz.{k}",
                (xx, xx + 0.4),
                (ya, ya + size),
                (z - 0.04, z),
                hazard if k % 2 == 0 else black,
                "Exterior",
            )
            k += 1


# --- the interior: rooms, doors, conduits, tanks, decks --------------------------


def room_colour(room_id):
    return ROOM_COLOURS.get(room_id) or id_colour(room_id)


def build_interior(geometry, hull):
    label_mat = material("label", "#0e1013", 0.0, 0.8)
    door_label_mat = material("door-label", "#ffe2a0", 0.0, 0.8)
    door_mat = material("door", "#ffcc33", 0.1, 0.5)
    tank_mat = material("tank", "#6b7480", 0.5, 0.4)
    deck_mat = material("deck-plate", "#30353b", 0.3, 0.7)
    deck_edge = material("deck-edge", "#5b636d", 0.3, 0.7)
    deck_floor = {d["id"]: d["floor"] for d in geometry["decks"]}
    deck_ids = [d["id"] for d in geometry["decks"]]

    for room in geometry["compartments"]:
        mat = material(f"room.{room['id']}", room_colour(room["id"]), 0.0, 0.7)
        for k, box in enumerate(room["boxes"]):
            box_object(
                f"Room.{room['id']}.{k}",
                box["x"],
                box["y"],
                box["z"],
                mat,
                "Interior",
                decks=room["decks"],
                inset=0.07,
            )
            # A plan box per deck, cut to that deck's band, so a two-deck room
            # does not cover the plan's labels and conduits.
            for deck in room["decks"]:
                f = deck_floor[deck]
                z = (max(box["z"][0], f), min(box["z"][1], f + 3.2))
                box_object(
                    f"Plan.{deck}.{room['id']}.{k}",
                    box["x"],
                    box["y"],
                    z,
                    mat,
                    "Interior.plan",
                    decks=(deck,),
                    inset=0.07,
                )
        biggest = max(
            room["boxes"], key=lambda b: (b["x"][1] - b["x"][0]) * (b["y"][1] - b["y"][0])
        )
        xc = (biggest["x"][0] + biggest["x"][1]) / 2
        yc = (biggest["y"][0] + biggest["y"][1]) / 2
        zc = (biggest["z"][0] + biggest["z"][1]) / 2
        if room["id"] == "reactor-bay":
            zc = biggest["z"][0] + 1.9
        if not room["pressurised"]:
            zc = biggest["z"][1] - 1.4
        if room["decks"] == ["upper"]:
            # Above the railgun barrel, which runs through the upper deck.
            zc = biggest["z"][1] - 1.05
        size = 0.75
        text_object(
            f"Label.side.{room['id']}",
            room["id"],
            (xc, -10.5, zc + 0.35),
            size,
            label_mat,
            "Labels.side",
            (math.radians(90), 0, 0),
        )
        # A deck plan label sits in the room's starboard forward corner, clear
        # of the centreline trunk, above the conduits, on each deck the room spans.
        for deck in room["decks"]:
            top = deck_floor[deck] + 3.5
            at = (biggest["x"][0] + 0.35, biggest["y"][1] - 0.7, top)
            label = text_object(
                f"Label.plan.{deck}.{room['id']}",
                room["id"],
                at,
                0.8,
                label_mat,
                "Labels.plan",
                decks=(deck,),
            )
            label.data.align_x = "LEFT"

    for door in geometry["doors"]:
        flat = [a for a in "xyz" if door[a][0] == door[a][1]][0]
        span = {a: list(door[a]) for a in "xyz"}
        span[flat] = [door[flat][0] - 0.18, door[flat][0] + 0.18]
        if flat == "z":
            # A floor hatch shows on the deck below and the deck above its plane.
            at = door["z"][0]
            decks = [d for d in deck_ids if deck_floor[d] - 1.3 <= at <= deck_floor[d] + 3.2 + 0.01]
        else:
            mid = sum(door["z"]) / 2
            decks = [d for d in deck_ids if deck_floor[d] <= mid < deck_floor[d] + 3.2]
        box_object(
            f"Door.{door['id']}.leaf",
            span["x"],
            span["y"],
            span["z"],
            door_mat,
            "Doors",
            decks=decks,
        )
        xc = sum(door["x"]) / 2
        yc = sum(door["y"]) / 2
        zc = sum(door["z"]) / 2
        if flat == "x":
            at, rot = (xc + 0.4, -10.4, zc + 0.2), (math.radians(90), math.radians(-90), 0)
        elif flat == "z" and door["kind"] == "bay-door":
            at, rot = (xc, -10.4, zc - 1.0), (math.radians(90), 0, 0)
        elif flat == "z":
            at, rot = (xc, -10.4, zc + 0.35), (math.radians(90), 0, 0)
        else:
            at, rot = (xc, -10.4, door["z"][1] + 0.35), (math.radians(90), 0, 0)
        text_object(
            f"Label.side.door.{door['id']}",
            door["id"],
            at,
            0.32,
            door_label_mat,
            "Labels.side",
            rot,
        )
        for deck in decks:
            # The plan marks the door on top of the rooms at this deck's ceiling.
            mark = {a: list(door[a]) for a in "xy"}
            if flat in ("x", "y"):
                mark[flat] = [door[flat][0] - 0.3, door[flat][0] + 0.3]
            top = deck_floor[deck] + 3.2
            box_object(
                f"Plan.{deck}.door.{door['id']}",
                mark["x"],
                mark["y"],
                (top - 0.05, top + 0.02),
                door_mat,
                "Doors.plan",
                decks=(deck,),
            )
            if flat == "x":
                pat, prot = (xc + 0.45, yc, deck_floor[deck] + 3.5), (0, 0, math.radians(90))
            elif flat == "y":
                pat, prot = (
                    (xc, yc + (0.45 if yc > 0 else -0.45), deck_floor[deck] + 3.5),
                    (0, 0, 0),
                )
            else:
                pat, prot = (xc, door["y"][0] - 0.35, deck_floor[deck] + 3.5), (0, 0, 0)
            text_object(
                f"Label.plan.{deck}.door.{door['id']}",
                door["id"],
                pat,
                0.42,
                door_label_mat,
                "Labels.plan",
                prot,
                decks=(deck,),
            )

    for tank in geometry["tanks"]:
        x0, x1 = tank["x"]
        y0, y1 = tank["y"]
        z0, z1 = tank["z"]
        r = min(z1 - z0, 2.4) / 2
        n = max(1, int((y1 - y0) // (2 * r + 0.2)))
        decks = [d for d in deck_ids if deck_floor[d] <= (z0 + z1) / 2 < deck_floor[d] + 3.2]
        for k in range(n):
            yc = lerp(y0, y1, (k + 0.5) / n)
            obj = cylinder_x(
                f"Tank.{tank['id']}.{k}",
                x0,
                x1,
                yc,
                (z0 + z1) / 2,
                r * 0.95,
                r * 0.95,
                tank_mat,
                "Tanks",
                segments=20,
                side="port" if yc < 0 else "starboard",
            )
            obj["decks"] = ",".join(decks)

    # Deck plates at each floor and at the top of the upper deck, cut to the hull.
    levels = [d["floor"] for d in geometry["decks"]] + [
        geometry["decks"][-1]["floor"] + geometry["decks"][-1]["height"]
    ]
    xs = frange(0.0, geometry["hull"]["stations"][-1]["x"], 0.5)
    for level in levels:
        outline = [
            (x, hull.half_width_at(x, level) - 0.25)
            for x in xs
            if hull.half_width_at(x, level) > 0.5
        ]
        verts = [(x, -w, level - 0.06) for x, w in outline] + [
            (x, w, level - 0.06) for x, w in reversed(outline)
        ]
        top = [(x, y, level) for x, y, _ in verts]
        n = len(verts)
        faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
        faces += [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
        decks = [d["id"] for d in geometry["decks"] if abs(d["floor"] - level) < 1e-6]
        mesh_object(f"Deck.{level:g}", verts + top, faces, deck_mat, "Decks", decks=decks)
        # A slightly wider dark outline under the plate stands for the hull skin in the plans.
        ring = [
            (x, hull.half_width_at(x, level + 1.6) + 0.0)
            for x in xs
            if hull.half_width_at(x, level + 1.6) > 0.5
        ]
        if decks:
            v2 = [(x, -w, level - 0.3) for x, w in ring] + [
                (x, w, level - 0.3) for x, w in reversed(ring)
            ]
            mesh_object(
                f"Deck.{level:g}.skin",
                v2,
                [tuple(range(len(v2)))],
                deck_edge,
                "Decks.skin",
                decks=decks,
            )


def build_conduits(geometry):
    deck_bands = [(d["id"], d["floor"], d["floor"] + d["height"]) for d in geometry["decks"]]
    for conduit in geometry["conduits"]:
        mat = material(
            f"conduit.{conduit['kind']}", CONDUIT_COLOURS.get(conduit["kind"], "#ffffff"), 0.1, 0.4
        )
        path = conduit["path"]
        side = "centre"
        tube_object(f"Conduit.{conduit['id']}", path, 0.11, mat, "Conduits", side)
        # One object per leg for the deck plans, tagged with the decks it runs on.
        for k, (a, b) in enumerate(zip(path, path[1:])):
            lo, hi = min(a[2], b[2]), max(a[2], b[2])
            decks = [d for d, f, c in deck_bands if f - 0.01 <= lo and hi <= c + 0.01]
            if not decks:
                decks = [d for d, f, c in deck_bands if f <= hi and lo <= c]
            # Lift each leg above the rooms in the plan so it draws over them.
            tube_object(
                f"Leg.{conduit['id']}.{k}",
                [(a[0], a[1], 0), (b[0], b[1], 0)],
                0.13,
                mat,
                "Conduits.plan",
                side,
                decks,
            )


# --- views ------------------------------------------------------------------------


def set_visible(predicate):
    for obj in bpy.context.scene.objects:
        if obj.type == "CAMERA" or obj.type == "LIGHT":
            continue
        show = bool(predicate(obj))
        obj.hide_render = not show
        obj.hide_set(not show)


def coll_of(obj):
    return obj.users_collection[0].name if obj.users_collection else ""


def camera(name, location, rotation, ortho_scale=None, lens=50):
    cam_data = bpy.data.cameras.new(name)
    if ortho_scale is not None:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
    else:
        cam_data.lens = lens
    cam_data.clip_end = 1000
    cam = bpy.data.objects.new(name, cam_data)
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.collection.objects.link(cam)
    return cam


def engine_id(preferred):
    items = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    for name in preferred:
        if name in items:
            return name
    return "BLENDER_WORKBENCH"


def workbench(scene, background="#15181c", shadows=True):
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.cavity_ridge_factor = 1.0
    shading.cavity_valley_factor = 1.4
    shading.curvature_ridge_factor = 1.0
    shading.curvature_valley_factor = 1.0
    shading.show_object_outline = True
    shading.object_outline_color = (0.02, 0.02, 0.03)
    shading.show_specular_highlight = True
    # Workbench casts a label's shadow onto the rooms behind it, so the
    # labelled views turn shadows off.
    shading.show_shadows = shadows
    shading.shadow_intensity = 0.35
    scene.display.shadow_focus = 0.2
    scene.display.light_direction = (0.35, -0.45, 0.82)
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
        "frame_range",
        "memory",
        "hostname",
        "camera",
        "lens",
        "scene",
        "marker",
        "filename",
        "sequencer_strip",
    ):
        if hasattr(scene.render, f"use_stamp_{field}"):
            setattr(scene.render, f"use_stamp_{field}", False)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"meridian-ship: wrote {path}")


def exterior_only(obj):
    return coll_of(obj) in ("Hull", "Exterior")


def view_side(scene, out, width):
    workbench(scene)
    set_visible(exterior_only)
    cam = camera("Cam.side", (36.0, -150, 8.5), (math.radians(90), 0, 0), ortho_scale=82)
    render(scene, cam, os.path.join(out, "sv01-side.png"), width, int(width * 0.3))


def view_top(scene, out, width):
    workbench(scene)
    set_visible(exterior_only)
    cam = camera("Cam.top", (37.5, 0, 150), (0, 0, 0), ortho_scale=102)
    render(scene, cam, os.path.join(out, "sv01-top.png"), width, int(width * 1.22))


def view_cutaway(scene, out, width):
    workbench(scene, shadows=False)

    def show(obj):
        c = coll_of(obj)
        if c in ("Interior", "Doors", "Conduits", "Labels.side", "Decks"):
            return True
        if c == "Tanks":
            return obj["side"] != "port" or "storm" not in obj.name
        if c in ("Hull", "Exterior"):
            return obj["side"] != "port"
        return False

    set_visible(show)
    cam = camera("Cam.cutaway", (36.0, -150, 8.0), (math.radians(90), 0, 0), ortho_scale=80)
    # The cutaway carries every room and door id, so it renders at 1.5 times the width.
    render(
        scene, cam, os.path.join(out, "sv01-cutaway.png"), int(width * 1.5), int(width * 1.5 * 0.3)
    )


def view_decks(scene, out, width, geometry):
    workbench(scene, shadows=False)
    for deck in geometry["decks"]:
        did = deck["id"]

        def show(obj, did=did):
            c = coll_of(obj)
            decks = obj.get("decks", "").split(",")
            if c in (
                "Interior.plan",
                "Doors.plan",
                "Labels.plan",
                "Conduits.plan",
                "Decks",
                "Decks.skin",
                "Tanks",
            ):
                return did in decks
            return False

        set_visible(show)
        # The plan legs sit at z 0; lift them to this deck's ceiling.
        for obj in collection("Conduits.plan").objects:
            obj.location.z = deck["floor"] + 3.22
        cam = camera(f"Cam.deck.{did}", (36.0, 0, 150), (0, 0, 0), ortho_scale=76)
        render(
            scene,
            cam,
            os.path.join(out, f"sv01-deck-{did}.png"),
            int(width * 1.5),
            int(width * 1.5 * 0.26),
        )


def view_hero(scene, out, width):
    set_visible(exterior_only)
    eevee = engine_id(("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"))
    scene.render.engine = eevee
    if eevee == "BLENDER_WORKBENCH":
        workbench(scene, "#0b0d12")
    else:
        try:
            scene.eevee.taa_render_samples = 48
        except AttributeError:
            pass
        world = scene.world
        if world.node_tree is None and hasattr(world, "use_nodes"):
            world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg is not None:
            # A faint blue-grey fill, so the shadowed flanks keep their panels.
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
    target = Vector((38, 0, 5))
    loc = Vector((-38, 78, 40))
    cam = camera("Cam.hero", tuple(loc), (0, 0, 0), lens=42)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (target - loc).to_track_quat("-Z", "Y")
    render(scene, cam, os.path.join(out, "sv01-hero.png"), width, int(width * 9 / 16))


# --- entry point --------------------------------------------------------------------


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build_ship.py")
    parser.add_argument("--geometry", default=DEFAULT_GEOMETRY)
    parser.add_argument("--out", required=True, help="directory for the renders")
    parser.add_argument("--views", default=",".join(VIEWS))
    parser.add_argument("--width", type=int, default=2048)
    parser.add_argument("--blend", help="save the scene as this .blend file")
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.unit_settings.system = "METRIC"
    return scene


def main():
    args = parse_args()
    with open(args.geometry, encoding="utf-8") as fh:
        geometry = json.load(fh)
    os.makedirs(args.out, exist_ok=True)
    scene = reset_scene()
    rng = random.Random(SEED)
    hull = Hull(geometry["hull"])
    build_hull(geometry, hull, rng)
    build_exterior(geometry, hull, rng)
    build_interior(geometry, hull)
    build_conduits(geometry)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
        print(f"meridian-ship: wrote {args.blend}")
    views = [v for v in args.views.split(",") if v]
    for view in views:
        if view not in VIEWS:
            raise SystemExit(f"unknown view {view}; choose from {', '.join(VIEWS)}")
    # The hero changes the render engine and adds lights, so it runs last.
    for view in sorted(views, key=lambda v: v == "hero"):
        if view == "side":
            view_side(scene, args.out, args.width)
        elif view == "top":
            view_top(scene, args.out, args.width)
        elif view == "cutaway":
            view_cutaway(scene, args.out, args.width)
        elif view == "decks":
            view_decks(scene, args.out, args.width, geometry)
        elif view == "hero":
            view_hero(scene, args.out, args.width)


if __name__ == "__main__":
    main()
