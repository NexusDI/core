"""The Meridian's hull math and its 2D outlines, in plain Python.

The website and the PixiJS deck view need crisp vector shapes, so this module
projects the geometry file straight to SVG: the hull silhouette from the side
and from above, the side cutaway with every compartment and door, and one plan
per deck. `build_ship.py` imports the same hull math to build the mesh, so the
mesh and the outlines cannot disagree.

    python3 tools/meridian-ship/ship_svg.py --out <dir>
    python3 tools/meridian-ship/ship_svg.py --out <dir> --schematic

`--schematic` writes one file, `meridian-schematic.svg`, for the docs front
page. It carries no fill, no stroke colour and no text: the parts name
themselves by class (`sv-hull`, `sv-room`, `sv-fixture`, `sv-door`) and by
`data-volume`, `data-part`, `data-room`, `data-fixture` and `data-door`, and
the page's CSS paints them.

    python3 tools/meridian-ship/ship_svg.py --cutaway-layers <dir>

`--cutaway-layers` writes the data layers of the unlit cutaway that Pixi lights
at run time, on the frame of the painted side views (2048 by 512 pixels at 25.6
pixels per metre): `meridian-cutaway-rooms.png` (a room index mask) with its
`meridian-cutaway-rooms.legend.json`, `meridian-cutaway-emissive.png` and
`meridian-cutaway-lights.json`.
"""

import argparse
import json
import math
import os
import re
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_GEOMETRY = os.path.join(
    os.path.dirname(os.path.dirname(HERE)),
    "examples",
    "meridian-systems",
    "deck",
    "meridian.geometry.json",
)

# One colour per compartment for the cutaway and the deck plans.
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
SILHOUETTE = "#c9ced4"
HULL_FILL = "#2a3038"
DOOR = "#ffcc33"
FIXTURE = "#5d636b"


def lerp(a, b, t):
    return a + (b - a) * t


def load(path=DEFAULT_GEOMETRY):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class Hull:
    """The hull as the union of its volumes, each an octagon lofted between stations."""

    def __init__(self, hull):
        self.volumes = hull["volumes"]

    @staticmethod
    def params(volume, x):
        """The section of `volume` at x, or None outside its length."""
        st = volume["stations"]
        if x < st[0]["x"] or x > st[-1]["x"]:
            return None
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
        return None

    @classmethod
    def half_profile(cls, volume, x):
        """The (y, z) outline on the starboard side, from the keel centreline to the dorsal one."""
        p = cls.params(volume, x)
        w, bot, top = p["w"], p["bottom"], p["top"]
        return [
            (0.0, bot),
            (w - p["bdy"], bot),
            (w, bot + p["bdz"]),
            (w, top - p["tdz"]),
            (w - p["tdy"], top),
            (0.0, top),
        ]

    def half_width_at(self, x, z):
        """The hull's half beam at (x, z), or 0 outside every volume."""
        best = 0.0
        for v in self.volumes:
            p = self.params(v, x)
            if p is None or not p["bottom"] <= z <= p["top"]:
                continue
            if z < p["bottom"] + p["bdz"]:
                w = p["w"] - p["bdy"] + p["bdy"] * (z - p["bottom"]) / p["bdz"]
            elif z > p["top"] - p["tdz"]:
                w = p["w"] - p["tdy"] * (z - (p["top"] - p["tdz"])) / p["tdz"]
            else:
                w = p["w"]
            best = max(best, w)
        return best

    def top_at(self, x):
        tops = [p["top"] for p in (self.params(v, x) for v in self.volumes) if p]
        return max(tops) if tops else 0.0

    def bottom_at(self, x):
        bots = [p["bottom"] for p in (self.params(v, x) for v in self.volumes) if p]
        return min(bots) if bots else 0.0


# --- exterior outlines: each part as polygons in (x, z) for the side and (x, y) for the top ----


def part_outlines(geometry, hull):
    """Side and top polygons of every exterior part that changes the silhouette."""
    ext = geometry["exterior"]
    side, top = [], []
    rg = ext["railgun"]
    # Each ring runs bottom left, bottom right, top right, top left.
    for rings in (shroud_rings(rg, hull), hump_rings(rg, hull)):
        side.append(
            [(r[3][0], r[3][2]) for r in rings] + [(r[0][0], r[0][2]) for r in reversed(rings)]
        )
        top.append(
            [(r[1][0], r[1][1]) for r in rings] + [(r[0][0], r[0][1]) for r in reversed(rings)]
        )
    ch = ext["commsHousing"]
    base = hull.top_at(sum(ch["x"]) / 2)
    side.append(
        [
            (ch["x"][0], base - 0.2),
            (ch["x"][0] + 1.5, base + ch["height"]),
            (ch["x"][1] - 1.5, base + ch["height"]),
            (ch["x"][1], base - 0.2),
        ]
    )
    top.append(
        [
            (ch["x"][0], ch["y"][0] + 0.6),
            (ch["x"][0] + 1.5, ch["y"][0]),
            (ch["x"][1] - 1.5, ch["y"][0]),
            (ch["x"][1], ch["y"][0] + 0.6),
            (ch["x"][1], ch["y"][1] - 0.6),
            (ch["x"][1] - 1.5, ch["y"][1]),
            (ch["x"][0] + 1.5, ch["y"][1]),
            (ch["x"][0], ch["y"][1] - 0.6),
        ]
    )
    sb = ext["sensorBlister"]
    sbase = hull.top_at(sum(sb["x"]) / 2)
    side.append(
        ellipse(sum(sb["x"]) / 2, sbase, (sb["x"][1] - sb["x"][0]) / 2, sb["radius"], upper=True)
    )
    top.append(ellipse(sum(sb["x"]) / 2, sb["y"], (sb["x"][1] - sb["x"][0]) / 2, sb["radius"]))
    for n in ext["nacelles"]:
        for poly in nacelle_outline(n):
            side.append(
                [(x, n["axis"]["z"] + r) for x, r in poly]
                + [(x, n["axis"]["z"] - r) for x, r in reversed(poly)]
            )
            top.append(
                [(x, n["axis"]["y"] + r) for x, r in poly]
                + [(x, n["axis"]["y"] - r) for x, r in reversed(poly)]
            )
        px = n["pylon"]["x"]
        sign = 1 if n["axis"]["y"] > 0 else -1
        top.append(
            [
                (px[0], sign * 3.0),
                (px[1], sign * 3.0),
                (px[1] - 1.5, n["axis"]["y"]),
                (px[0] + 1.0, n["axis"]["y"]),
            ]
        )
    for b in ext["engineBells"]:
        x0, x1 = b["x"]
        for c, poly in ((b["axis"]["z"], side), (b["axis"]["y"], top)):
            poly.append(
                [
                    (x0, c - b["throatRadius"]),
                    (x1, c - b["exitRadius"]),
                    (x1, c + b["exitRadius"]),
                    (x0, c + b["throatRadius"]),
                ]
            )
    return side, top


def nacelle_outline(n):
    """The nacelle's radius along x: a tapered intake, the barrel and a short tail cone."""
    x0, x1 = n["x"]
    r = n["radius"]
    return [[(x0, r * 0.55), (x0 + 2.0, r * 0.95), (x0 + 3.0, r), (x1 - 2.5, r), (x1, r * 0.85)]]


def ellipse(cx, cy, rx, ry, upper=False, n=24):
    a0, a1 = (0, math.pi) if upper else (0, 2 * math.pi)
    return [
        (cx + rx * math.cos(lerp(a0, a1, k / n)), cy + ry * math.sin(lerp(a0, a1, k / n)))
        for k in range(n + 1)
    ]


def shroud_rings(rg, hull):
    """The barrel shroud as four-point rings (bottom left, bottom right, top right, top left)."""
    sh = rg["shroud"]
    az = rg["axis"]["z"]
    out = []
    for x, top in (
        (sh["x"][0], az + 0.9),
        (6.0, sh["top"] - 0.6),
        (11.0, sh["top"]),
        (sh["x"][1], sh["top"]),
    ):
        # Over the low bow the shroud wraps the barrel; aft of it the barrel
        # runs inside the hull and the shroud sits on the roof.
        roof = hull.top_at(x)
        bot = roof - 0.3 if roof > az + 1.0 else az - 0.9
        hw = sh["halfWidth"]
        out.append([(x, -hw, bot), (x, hw, bot), (x, hw, top), (x, -hw, top)])
    return out


def hump_rings(rg, hull):
    hump, sh = rg["breechHump"], rg["shroud"]
    out = []
    for x, top, hw in (
        (hump["x"][0], sh["top"], sh["halfWidth"] + 0.2),
        (hump["x"][0] + 2.5, hump["top"], hump["halfWidth"]),
        (hump["x"][1] - 2.0, hump["top"], hump["halfWidth"]),
        (hump["x"][1], hull.top_at(hump["x"][1]) + 0.1, hump["halfWidth"] - 0.8),
    ):
        bot = hull.top_at(x) - 0.3
        out.append([(x, -hw, bot), (x, hw, bot), (x, hw, top), (x, -hw, top)])
    return out


def volume_side(volume, hull):
    xs = [s["x"] for s in volume["stations"]]
    return [(x, hull.params(volume, x)["top"]) for x in xs] + [
        (x, hull.params(volume, x)["bottom"]) for x in reversed(xs)
    ]


def volume_top(volume, hull):
    xs = [s["x"] for s in volume["stations"]]
    return [(x, hull.params(volume, x)["w"]) for x in xs] + [
        (x, -hull.params(volume, x)["w"]) for x in reversed(xs)
    ]


# --- SVG writing --------------------------------------------------------------------------


def path(points, flip, fill, extra=""):
    d = "M" + " L".join(f"{x:.2f},{flip(y):.2f}" for x, y in points) + " Z"
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def svg(view_box, body, title):
    x, y, w, h = view_box
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {w:g} {h:g}" '
        f'font-family="sans-serif">\n<title>{title}</title>\n' + "\n".join(body) + "\n</svg>\n"
    )


def side_svg(geometry, hull):
    """The port side silhouette: bow to the left, z up. One unit is one metre."""
    side, _ = part_outlines(geometry, hull)
    flip = lambda z: 16 - z  # noqa: E731
    body = [
        path(volume_side(v, hull), flip, SILHOUETTE, f' data-volume="{v["id"]}"')
        for v in hull.volumes
    ]
    body += [path(p, flip, SILHOUETTE) for p in side]
    return svg((-2, 0, 76, 18), body, "SV-01 Meridian, side")


def top_svg(geometry, hull):
    """The dorsal silhouette: bow to the left, starboard up."""
    _, top = part_outlines(geometry, hull)
    flip = lambda y: -y  # noqa: E731
    body = [
        path(volume_top(v, hull), flip, SILHOUETTE, f' data-volume="{v["id"]}"')
        for v in hull.volumes
    ]
    body += [path(p, flip, SILHOUETTE) for p in top]
    return svg((-2, -12, 76, 24), body, "SV-01 Meridian, top")


def fixture_shape(f, a, b, flip):
    """A fixture's outline in the (a, b) plane; seen from above, a cylinder is an ellipse."""
    a0, a1 = f[a]
    b0, b1 = f[b]
    tag = f'fill="{FIXTURE}" data-fixture="{f["id"]}"'
    if f["shape"] == "cylinder" and (a, b) == ("x", "y"):
        cx, cy = (a0 + a1) / 2, flip((b0 + b1) / 2)
        rx, ry = (a1 - a0) / 2, (b1 - b0) / 2
        return f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx:.2f}" ry="{ry:.2f}" {tag}/>'
    w, h = a1 - a0, b1 - b0
    return f'<rect x="{a0:.2f}" y="{flip(b1):.2f}" width="{w:.2f}" height="{h:.2f}" {tag}/>'


def label(x, y, text, size, fill="#0e1013", anchor="middle"):
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" font-size="{size}" fill="{fill}" '
        f'text-anchor="{anchor}" dominant-baseline="middle">{text}</text>'
    )


def cutaway_svg(geometry, hull):
    """The side cutaway on the centreline: the hull, every compartment box and every door."""
    side, _ = part_outlines(geometry, hull)
    flip = lambda z: 16 - z  # noqa: E731
    body = [path(volume_side(v, hull), flip, HULL_FILL) for v in hull.volumes]
    body += [path(p, flip, HULL_FILL) for p in side]
    for room in geometry["compartments"]:
        colour = ROOM_COLOURS.get(room["id"], "#888888")
        for box in room["boxes"]:
            x0, x1 = box["x"]
            z0, z1 = box["z"]
            body.append(
                f'<rect x="{x0 + 0.05:.2f}" y="{flip(z1) + 0.05:.2f}" width="{x1 - x0 - 0.1:.2f}" '
                f'height="{z1 - z0 - 0.1:.2f}" fill="{colour}" data-room="{room["id"]}"/>'
            )
        big = max(room["boxes"], key=lambda b: (b["x"][1] - b["x"][0]) * (b["z"][1] - b["z"][0]))
        body.append(label(sum(big["x"]) / 2, flip(big["z"][1] - 1.0), room["id"], 0.7))
    body += [
        fixture_shape(f, "x", "z", flip)
        for room in geometry["compartments"]
        for f in room["fixtures"]
    ]
    for door in geometry["doors"]:
        flat = [a for a in "xyz" if door[a][0] == door[a][1]][0]
        x0, x1 = door["x"]
        z0, z1 = door["z"]
        if flat == "x":
            x0, x1 = x0 - 0.15, x1 + 0.15
        if flat == "z":
            z0, z1 = z0 - 0.15, z1 + 0.15
        body.append(
            f'<rect x="{x0:.2f}" y="{flip(z1):.2f}" width="{x1 - x0:.2f}" height="{z1 - z0:.2f}" '
            f'fill="{DOOR}" data-door="{door["id"]}"/>'
        )
    return svg((-2, 0, 76, 18), body, "SV-01 Meridian, cutaway")


def deck_svg(geometry, hull, deck):
    """One deck's plan from above: the hull cut at the deck, its rooms and its doors."""
    floor = deck["floor"]
    zc = floor + deck["height"] / 2
    flip = lambda y: -y  # noqa: E731
    xs = [k * 0.25 for k in range(0, 4 * 72 + 1)]
    edge = [(x, hull.half_width_at(x, zc)) for x in xs if hull.half_width_at(x, zc) > 0]
    outline = edge + [(x, -w) for x, w in reversed(edge)]
    body = [path(outline, flip, HULL_FILL)]
    labels = []
    for room in geometry["compartments"]:
        if deck["id"] not in room["decks"]:
            continue
        colour = ROOM_COLOURS.get(room["id"], "#888888")
        for box in room["boxes"]:
            x0, x1 = box["x"]
            y0, y1 = box["y"]
            body.append(
                f'<rect x="{x0 + 0.05:.2f}" y="{flip(y1) + 0.05:.2f}" width="{x1 - x0 - 0.1:.2f}" '
                f'height="{y1 - y0 - 0.1:.2f}" fill="{colour}" data-room="{room["id"]}"/>'
            )
        for f in room["fixtures"]:
            if f["z"][1] <= floor or f["z"][0] >= floor + deck["height"]:
                continue
            body.append(fixture_shape(f, "x", "y", flip))
        # The label sits in the room's starboard forward corner, clear of the doors on
        # the centreline, and draws last so nothing covers it.
        big = max(room["boxes"], key=lambda b: (b["x"][1] - b["x"][0]) * (b["y"][1] - b["y"][0]))
        at = (big["x"][0] + 0.3, flip(big["y"][1]) + 0.8)
        labels.append(label(*at, room["id"], 0.8, anchor="start"))
    for door in geometry["doors"]:
        flat = [a for a in "xyz" if door[a][0] == door[a][1]][0]
        if flat == "z":
            on = floor - 0.01 <= door["z"][0] <= floor + deck["height"] + 0.01
        else:
            on = floor <= sum(door["z"]) / 2 < floor + deck["height"]
        if not on:
            continue
        x0, x1 = door["x"]
        y0, y1 = door["y"]
        if flat == "x":
            x0, x1 = x0 - 0.2, x1 + 0.2
        if flat == "y":
            y0, y1 = y0 - 0.2, y1 + 0.2
        body.append(
            f'<rect x="{x0:.2f}" y="{flip(y1):.2f}" width="{x1 - x0:.2f}" height="{y1 - y0:.2f}" '
            f'fill="{DOOR}" data-door="{door["id"]}"/>'
        )
    return svg((-2, -10, 76, 20), body + labels, f"SV-01 Meridian, {deck['id']} deck")


def plain_path(points, flip, cls, data):
    d = "M" + " L".join(f"{x:.2f},{flip(y):.2f}" for x, y in points) + " Z"
    return f'<path class="{cls}" d="{d}" {data}/>'


def plain_fixture(f, flip):
    """A fixture's side outline with a class and its id, and no paint."""
    x0, x1 = f["x"]
    z0, z1 = f["z"]
    return (
        f'<rect class="sv-fixture" x="{x0:.2f}" y="{flip(z1):.2f}" width="{x1 - x0:.2f}" '
        f'height="{z1 - z0:.2f}" data-fixture="{f["id"]}"/>'
    )


def door_rect(door, flip):
    """A door's side-view rectangle as (x, y, width, height) in SVG units."""
    flat = [a for a in "xyz" if door[a][0] == door[a][1]][0]
    x0, x1 = door["x"]
    z0, z1 = door["z"]
    if flat == "x":
        x0, x1 = x0 - 0.15, x1 + 0.15
    if flat == "z":
        z0, z1 = z0 - 0.15, z1 + 0.15
    return [x0, flip(z1), x1 - x0, z1 - z0], flat


def overlap(a, b):
    return min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]) > 1e-9 and (
        min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]) > 1e-9
    )


def separate_doors(doors, flip):
    """Side-view door rectangles that share no area.

    Doors on the port and starboard sides, or in line along the hull, project to the same
    rectangle. Upright doors that overlap split their height into equal bands, in order of
    their y and then their id. A floor hatch that still overlaps an upright door trims it.
    """
    rects = {d["id"]: door_rect(d, flip) for d in doors}
    upright = [d for d in doors if rects[d["id"]][1] != "z"]
    parent = {d["id"]: d["id"] for d in upright}

    def find(k):
        while parent[k] != k:
            k = parent[k]
        return k

    for i, a in enumerate(upright):
        for b in upright[i + 1 :]:
            if overlap(rects[a["id"]][0], rects[b["id"]][0]):
                parent[find(a["id"])] = find(b["id"])
    clusters = {}
    for d in upright:
        clusters.setdefault(find(d["id"]), []).append(d)
    out = {k: v[0] for k, v in rects.items()}
    for members in clusters.values():
        members.sort(key=lambda d: (sum(d["y"]) / 2, d["id"]))
        for n, d in enumerate(members):
            x, y, w, h = out[d["id"]]
            band = h / len(members)
            out[d["id"]] = [x, y + n * band, w, band]
    for d in doors:
        if rects[d["id"]][1] != "z":
            continue
        hatch = out[d["id"]]
        for u in upright:
            x, y, w, h = out[u["id"]]
            if not overlap(out[u["id"]], hatch):
                continue
            if hatch[1] + hatch[3] / 2 > y + h / 2:
                out[u["id"]] = [x, y, w, hatch[1] - y]
            else:
                top = hatch[1] + hatch[3]
                out[u["id"]] = [x, top, w, y + h - top]
    return out


# The frame of the painted side views: 80 by 20 metres at 25.6 pixels per metre, which is
# 2048 by 512 pixels. Metres map to the art by u = (x + 5) * 25.6 and v = (17.5 - z) * 25.6.
SCHEMATIC_FRAME = (-5, 0, 80, 20)
SCHEMATIC_TOP = 17.5


def subtract(piece, hole):
    """The parts of the rectangle `piece` outside the rectangle `hole`, as rectangles.

    A rectangle is (x0, y0, x1, y1). The parts share no area with `hole` or with each other.
    """
    px0, py0, px1, py1 = piece
    hx0, hy0, hx1, hy1 = hole
    if min(px1, hx1) - max(px0, hx0) <= 1e-9 or min(py1, hy1) - max(py0, hy0) <= 1e-9:
        return [piece]
    parts = []
    if hy0 > py0:
        parts.append((px0, py0, px1, hy0))
    if hy1 < py1:
        parts.append((px0, hy1, px1, py1))
    top, bottom = max(py0, hy0), min(py1, hy1)
    if hx0 > px0:
        parts.append((px0, top, hx0, bottom))
    if hx1 < px1:
        parts.append((hx1, top, px1, bottom))
    return parts


def partition_rooms(rects):
    """Room rectangles that share no area: the smaller rectangle keeps what it covers.

    `rects` holds (room id, (x0, y0, x1, y1)). Side views project boxes at different depths
    onto one plane, so the chart room covers part of the habitat and the airlock lies inside
    it. Rectangles go in order of area (to 6 places), then the number of rectangles their room
    has, then id, and each loses the area a smaller one holds, so a room can come back as
    several rectangles that carry its id. Two rectangles of one area go to the room with the
    fewer rectangles: the chart room's single box keeps x 10 to 14 from the habitat's.
    """
    count = {}
    for room, _ in rects:
        count[room] = count.get(room, 0) + 1
    ordered = sorted(
        rects,
        key=lambda r: (
            round((r[1][2] - r[1][0]) * (r[1][3] - r[1][1]), 6),
            count[r[0]],
            r[0],
            r[1],
        ),
    )
    claimed = []
    for room, rect in ordered:
        pieces = [rect]
        for _, held in claimed:
            pieces = [part for piece in pieces for part in subtract(piece, held)]
        claimed += [(room, piece) for piece in pieces]
    return sorted(claimed, key=lambda c: (c[1][0], c[1][1], c[0]))


def schematic_svg(geometry, hull):
    """The side cutaway for the page: the same shapes as the cutaway, with no paint and no labels.

    Every part carries a class and a `data-*` id so that CSS alone sets its look and state.
    The viewBox is the frame of the painted side views, so a part sits where the art paints it.
    """
    side, _ = part_outlines(geometry, hull)
    flip = lambda z: SCHEMATIC_TOP - z  # noqa: E731
    body = ['<g class="sv-hulls">']
    body += [
        plain_path(volume_side(v, hull), flip, "sv-hull", f'data-volume="{v["id"]}"')
        for v in hull.volumes
    ]
    body += [
        plain_path(p, flip, "sv-hull", f'data-part="exterior-{i}"') for i, p in enumerate(side)
    ]
    body += ["</g>", '<g class="sv-rooms">']
    for room, (x0, y0, x1, y1) in room_rects(geometry):
        body.append(
            f'<rect class="sv-room" x="{x0:.2f}" y="{y0:.2f}" '
            f'width="{x1 - x0:.2f}" height="{y1 - y0:.2f}" data-room="{room}"/>'
        )
    body += ["</g>", '<g class="sv-fixtures">']
    body += [plain_fixture(f, flip) for room in geometry["compartments"] for f in room["fixtures"]]
    body += ["</g>", '<g class="sv-doors">']
    for door, (x, y, w, h) in separate_doors(geometry["doors"], flip).items():
        body.append(
            f'<rect class="sv-door" x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" '
            f'height="{h:.2f}" data-door="{door}"/>'
        )
    body.append("</g>")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
        + " ".join(f"{n:g}" for n in SCHEMATIC_FRAME)
        + '">\n'
        + "\n".join(body)
        + "\n</svg>\n"
    )


def export_schematic(geometry, out):
    text = schematic_svg(geometry, Hull(geometry["hull"]))
    os.makedirs(out, exist_ok=True)
    target = os.path.join(out, "meridian-schematic.svg")
    with open(target, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print(f"meridian-ship: wrote {target}")


# --- cutaway layers: the masks and the lights of the unlit cutaway -----------------------------

PIXELS_PER_METRE = 25.6
LAYER_SIZE = (2048, 512)
SPACE, STRUCTURE, FIRST_ROOM = 0, 1, 2


def to_px(x, z):
    """Metres to pixels of the painted side views: u = (x + 5) * 25.6, v = (17.5 - z) * 25.6."""
    return (x + 5) * PIXELS_PER_METRE, (SCHEMATIC_TOP - z) * PIXELS_PER_METRE


def png_grey(width, height, rows):
    """An 8-bit greyscale PNG from `rows`, one bytes object of `width` samples per row."""

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def fill_polygon(grid, points, value):
    """Fills the polygon with `value` where a pixel centre lies inside it (even-odd rule)."""
    width = len(grid[0])
    ys = [p[1] for p in points]
    for row in range(
        max(0, math.ceil(min(ys) - 0.5)), min(len(grid), math.floor(max(ys) - 0.5) + 1)
    ):
        y = row + 0.5
        crossings = []
        for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
            if (ay <= y < by) or (by <= y < ay):
                crossings.append(ax + (y - ay) / (by - ay) * (bx - ax))
        crossings.sort()
        for left, right in zip(crossings[::2], crossings[1::2]):
            for col in range(
                max(0, math.ceil(left - 0.5)), min(width, math.floor(right - 0.5) + 1)
            ):
                grid[row][col] = value


def fill_rect(grid, u0, v0, u1, v1, value, outward=False):
    """Fills the pixels of the rectangle, rounded to the nearest edge or outward, one at least."""
    snap_low, snap_high = (math.floor, math.ceil) if outward else (round, round)
    c0, r0 = snap_low(u0), snap_low(v0)
    c1, r1 = max(snap_high(u1), c0 + 1), max(snap_high(v1), r0 + 1)
    for row in range(max(0, r0), min(len(grid), r1)):
        for col in range(max(0, c0), min(len(grid[0]), c1)):
            grid[row][col] = value


def room_legend(geometry):
    """Room ids in geometry order, from the first room index up."""
    return {room["id"]: FIRST_ROOM + n for n, room in enumerate(geometry["compartments"])}


def room_rects(geometry):
    """The partitioned room rectangles of the schematic, as (room id, (x0, y0, x1, y1))."""
    rects = []
    for room in geometry["compartments"]:
        for box in room["boxes"]:
            x0, x1 = box["x"]
            z0, z1 = box["z"]
            rects.append(
                (
                    room["id"],
                    (
                        round(x0 + 0.05, 2),
                        round(SCHEMATIC_TOP - z1 + 0.05, 2),
                        round(x1 - 0.05, 2),
                        round(SCHEMATIC_TOP - z0 - 0.05, 2),
                    ),
                )
            )
    return partition_rooms(rects)


def rooms_mask(geometry, hull):
    """The room index mask: 0 space, 1 hull structure, FIRST_ROOM and up the rooms."""
    width, height = LAYER_SIZE
    grid = [[SPACE] * width for _ in range(height)]
    side, _ = part_outlines(geometry, hull)
    shapes = [volume_side(v, hull) for v in hull.volumes] + side
    for shape in shapes:
        fill_polygon(grid, [to_px(x, z) for x, z in shape], STRUCTURE)
    legend = room_legend(geometry)
    for room, (x0, y0, x1, y1) in room_rects(geometry):
        u0, v0 = (x0 + 5) * PIXELS_PER_METRE, y0 * PIXELS_PER_METRE
        u1, v1 = (x1 + 5) * PIXELS_PER_METRE, y1 * PIXELS_PER_METRE
        fill_rect(grid, u0, v0, u1, v1, legend[room])
    return grid


def merged_lights(geometry):
    """The lights in pixels. Lights that coincide in the side view merge into one entry.

    The port and starboard lamps of a room project to one box, so they share an entry that
    lists every id. The centre is the middle of the housing box, and the radius is the
    light's reach in pixels.
    """
    groups = {}
    for light in geometry["lights"]:
        u0, v1 = to_px(light["x"][0], light["z"][0])
        u1, v0 = to_px(light["x"][1], light["z"][1])
        entry = {
            "ids": [light["id"]],
            "room": light["room"],
            "kind": light["kind"],
            "colour": light["colour"],
            "fixture": light.get("fixture"),
            "emissive": light["emissive"],
            "centre": [round((u0 + u1) / 2, 1), round((v0 + v1) / 2, 1)],
            "radius": round(light["radius"] * PIXELS_PER_METRE, 1),
            "box": [round(u0, 1), round(v0, 1), round(u1, 1), round(v1, 1)],
        }
        key = json.dumps({k: v for k, v in entry.items() if k != "ids"}, sort_keys=True)
        if key in groups:
            groups[key]["ids"].append(light["id"])
        else:
            groups[key] = entry
    return list(groups.values())


# A housing wider than this (in pixels) is a long strip, which reads as a white bar at full
# strength, so it glows at 45%.
STRIP_WIDTH = 128
STRIP_GLOW = 115


def emissive_mask(lights):
    """The housing box of every light marked emissive at 255, a long strip at 115, 0 elsewhere."""
    width, height = LAYER_SIZE
    grid = [[0] * width for _ in range(height)]
    for light in lights:
        if light["emissive"]:
            wide = light["box"][2] - light["box"][0] > STRIP_WIDTH
            fill_rect(grid, *light["box"], STRIP_GLOW if wide else 255, outward=True)
    return grid


def lights_text(lights):
    """The lights as JSON, one entry per line."""
    return (
        "[\n" + ",\n".join(json.dumps(entry, separators=(",", ":")) for entry in lights) + "\n]\n"
    )


def legend_text(legend):
    """The legend as JSON in the layout Prettier gives it: each box of numbers on one line."""
    text = json.dumps(legend, indent=2)
    text = re.sub(
        r"\[\s+([\d.\-]+(?:,\s+[\d.\-]+)*)\s+\]",
        lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]",
        text,
    )
    return text + "\n"


def room_bounds(geometry):
    """Each room's bounding box in whole pixels, as [left, top, right, bottom]."""
    bounds = {}
    for room, (x0, y0, x1, y1) in room_rects(geometry):
        box = [
            math.floor((x0 + 5) * PIXELS_PER_METRE),
            math.floor(y0 * PIXELS_PER_METRE),
            math.ceil((x1 + 5) * PIXELS_PER_METRE),
            math.ceil(y1 * PIXELS_PER_METRE),
        ]
        old = bounds.get(room)
        bounds[room] = (
            box
            if old is None
            else [
                min(old[0], box[0]),
                min(old[1], box[1]),
                max(old[2], box[2]),
                max(old[3], box[3]),
            ]
        )
    return {room["id"]: bounds[room["id"]] for room in geometry["compartments"]}


def export_cutaway_layers(geometry, out):
    hull = Hull(geometry["hull"])
    width, height = LAYER_SIZE
    lights = merged_lights(geometry)
    legend = {
        "size": {"width": width, "height": height},
        "frame": " ".join(f"{n:g}" for n in SCHEMATIC_FRAME),
        "pixelsPerMetre": PIXELS_PER_METRE,
        "space": SPACE,
        "structure": STRUCTURE,
        "rooms": room_legend(geometry),
        "bounds": room_bounds(geometry),
    }
    files = {
        "meridian-cutaway-rooms.png": png_grey(width, height, rooms_mask(geometry, hull)),
        "meridian-cutaway-rooms.legend.json": legend_text(legend).encode(),
        "meridian-cutaway-emissive.png": png_grey(width, height, emissive_mask(lights)),
        "meridian-cutaway-lights.json": lights_text(lights).encode(),
    }
    os.makedirs(out, exist_ok=True)
    for name, data in files.items():
        target = os.path.join(out, name)
        with open(target, "wb") as fh:
            fh.write(data)
        print(f"meridian-ship: wrote {target}")


def export_svgs(geometry, out):
    hull = Hull(geometry["hull"])
    files = {
        "sv01-side.svg": side_svg(geometry, hull),
        "sv01-top.svg": top_svg(geometry, hull),
        "sv01-cutaway.svg": cutaway_svg(geometry, hull),
    }
    for deck in geometry["decks"]:
        files[f"sv01-deck-{deck['id']}.svg"] = deck_svg(geometry, hull, deck)
    os.makedirs(out, exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"meridian-ship: wrote {os.path.join(out, name)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(prog="ship_svg.py")
    parser.add_argument("--geometry", default=DEFAULT_GEOMETRY)
    parser.add_argument("--out")
    parser.add_argument(
        "--schematic",
        action="store_true",
        help="write only meridian-schematic.svg, the unpainted cutaway for the docs front page",
    )
    parser.add_argument(
        "--cutaway-layers",
        metavar="DIR",
        help="write the room index mask, the emissive mask and the lights of the unlit cutaway",
    )
    args = parser.parse_args()
    if args.cutaway_layers:
        export_cutaway_layers(load(args.geometry), args.cutaway_layers)
    elif not args.out:
        parser.error("--out is required")
    elif args.schematic:
        export_schematic(load(args.geometry), args.out)
    else:
        export_svgs(load(args.geometry), args.out)
