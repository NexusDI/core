"""The Meridian's hull math and its 2D outlines, in plain Python.

The website and the PixiJS deck view need crisp vector shapes, so this module
projects the geometry file straight to SVG: the hull silhouette from the side
and from above, the side cutaway with every compartment and door, and one plan
per deck. `build_ship.py` imports the same hull math to build the mesh, so the
mesh and the outlines cannot disagree.

    python3 tools/meridian-ship/ship_svg.py --out <dir>
"""

import argparse
import json
import math
import os

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
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    export_svgs(load(args.geometry), args.out)
