"""Tests of the deck layers and the frame sidecars in ship_svg.py (standard library only).

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/meridian-ship
"""

import hashlib
import json
import os
import struct
import tempfile
import unittest
import zlib

import ship_svg

GEOMETRY = ship_svg.load()


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def read_grey(path):
    """Width, height and the rows of an 8-bit greyscale PNG written by png_grey."""
    with open(path, "rb") as fh:
        data = fh.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", data[16:24])
    at, parts = 8, []
    while at < len(data):
        (size,) = struct.unpack(">I", data[at : at + 4])
        if data[at + 4 : at + 8] == b"IDAT":
            parts.append(data[at + 8 : at + 8 + size])
        at += 12 + size
    raw = zlib.decompress(b"".join(parts))
    stride = width + 1
    return width, height, [raw[r * stride + 1 : (r + 1) * stride] for r in range(height)]


class GeometryHash(unittest.TestCase):
    def test_hashes_the_fields_of_the_cutaway_in_javascript_json(self):
        geometry = {
            "hull": {"a": 1.0, "b": 0.5},
            "compartments": [{"id": "x", "z": [4.0, -0.0]}],
            "doors": [],
            "conduits": [],
            "lights": [1],
        }
        text = (
            '{"hull":{"a":1,"b":0.5},"compartments":[{"id":"x","z":[4,0]}],'
            '"doors":[],"conduits":[]}'
        )
        self.assertEqual(
            ship_svg.geometry_hash(geometry), hashlib.sha256(text.encode()).hexdigest()
        )


class PolygonScan(unittest.TestCase):
    def test_fills_a_triangle_from_truncated_corners_with_both_ends_included(self):
        grid = [[0] * 12 for _ in range(8)]
        ship_svg.fill_polygon_scan(grid, [(1.6, 1.6), (8.4, 1.6), (8.4, 6.4)], 1)
        rows = ["".join(map(str, row)) for row in grid]
        self.assertEqual(
            rows,
            [
                "000000000000",
                "011111111000",
                "001111111000",
                "000011111000",
                "000001111000",
                "000000011000",
                "000000001000",
                "000000000000",
            ],
        )


class FrameSidecar(unittest.TestCase):
    def test_side_view_names_its_frame_and_origin(self):
        card = ship_svg.frame_sidecar("side", 2048, 512, GEOMETRY)
        self.assertEqual(card["view"], "side")
        self.assertEqual(card["size"], {"width": 2048, "height": 512})
        self.assertEqual(card["pixelsPerMetre"], 25.6)
        self.assertEqual(card["origin"], [128, 448])
        self.assertEqual(card["frame"], "-5 0 80 20")
        self.assertEqual(card["camera"]["projection"], "orthographic")
        self.assertEqual(card["geometry"], ship_svg.geometry_hash(GEOMETRY))

    def test_cutaway_renders_at_one_and_a_half_times_the_width(self):
        card = ship_svg.frame_sidecar("cutaway", 3072, 768, GEOMETRY)
        self.assertEqual(card["pixelsPerMetre"], 38.4)
        self.assertEqual(card["origin"], [192, 672])

    def test_top_view_centres_the_ship_axis(self):
        card = ship_svg.frame_sidecar("top", 2048, 737, GEOMETRY)
        self.assertEqual(card["pixelsPerMetre"], 25.6)
        self.assertEqual(card["origin"], [128, 368.5])
        self.assertEqual(card["frame"], "-5 -14.3945 80 28.789")

    def test_refuses_a_view_it_has_no_camera_for(self):
        with self.assertRaises(ValueError):
            ship_svg.frame_sidecar("hero", 2048, 1152, GEOMETRY)


class DeckLayers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        ship_svg.export_deck_layers(GEOMETRY, cls.tmp.name)
        cls.hash = ship_svg.geometry_hash(GEOMETRY)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def path(self, *parts):
        return os.path.join(self.tmp.name, *parts)

    def test_writes_the_same_files_for_every_deck_and_no_interactive_mask(self):
        for deck in GEOMETRY["decks"]:
            names = sorted(os.listdir(self.path(deck["id"])))
            self.assertEqual(
                names,
                [
                    "emissive-left.json",
                    "emissive-left.png",
                    "emissive-right.json",
                    "emissive-right.png",
                    "lights.json",
                    "roomid-left.json",
                    "roomid-left.png",
                    "roomid-legend.json",
                    "roomid-right.json",
                    "roomid-right.png",
                ],
            )

    def test_tiles_are_half_the_frame_each(self):
        for tile in ("left", "right"):
            width, height, _ = read_grey(self.path("main", f"roomid-{tile}.png"))
            self.assertEqual((width, height), (1216, 640))

    def test_a_room_pixel_carries_the_legend_index_of_its_room(self):
        legend = ship_svg.room_legend(GEOMETRY)
        _, _, left = read_grey(self.path("main", "roomid-left.png"))
        bridge = next(r for r in GEOMETRY["compartments"] if r["id"] == "bridge")
        box = bridge["boxes"][0]
        u = round((sum(box["x"]) / 2 + 2) * 32)
        v = round((10 - sum(box["y"]) / 2) * 32)
        self.assertEqual(left[v][u], legend["bridge"])
        self.assertEqual(left[0][0], ship_svg.SPACE)

    def test_the_right_tile_continues_the_left_at_pixel_1216(self):
        legend = ship_svg.room_legend(GEOMETRY)
        _, _, right = read_grey(self.path("main", "roomid-right.png"))
        engine = next(r for r in GEOMETRY["compartments"] if r["id"] == "reactor-bay")
        box = engine["boxes"][0]
        u = round((sum(box["x"]) / 2 + 2) * 32) - 1216
        v = round((10 - sum(box["y"]) / 2) * 32)
        self.assertEqual(right[v][u], legend["reactor-bay"])

    def test_the_emissive_mask_holds_only_emissive_lights_of_the_deck(self):
        lights = read_json(self.path("main", "lights.json"))
        self.assertTrue(lights)
        self.assertTrue(all(light["deck"] == "main" for light in lights))
        lit = 0
        for tile, base in (("left", 0), ("right", 1216)):
            _, _, rows = read_grey(self.path("main", f"emissive-{tile}.png"))
            for light in lights:
                c0, r0, c1, r1 = light["px_box"]
                if light["emissive"] and base <= c0 < base + 1216:
                    self.assertEqual(rows[r0][c0 - base], 255)
                    lit += 1
        self.assertGreater(lit, 0)
        self.assertTrue(any(not light["emissive"] for light in lights))

    def test_lights_carry_pixels_of_the_deck_frame(self):
        light = read_json(self.path("main", "lights.json"))[0]
        x0, x1 = light["x"]
        y0, y1 = light["y"]
        self.assertAlmostEqual(light["px_centre"][0], ((x0 + x1) / 2 + 2) * 32)
        self.assertAlmostEqual(light["px_centre"][1], (10 - (y0 + y1) / 2) * 32)
        self.assertAlmostEqual(light["px_radius"], light["radius"] * 32)

    def test_sidecars_place_each_image_by_themselves(self):
        for layer in ("roomid", "emissive"):
            for tile, offset in (("left", 0), ("right", 1216)):
                card = read_json(self.path("main", f"{layer}-{tile}.json"))
                self.assertEqual(card["view"], "deck-main")
                self.assertEqual(card["layer"], layer)
                self.assertEqual(card["pixelsPerMetre"], 32)
                self.assertEqual(card["origin"], [64, 320])
                self.assertEqual(card["frame"], "-2 -10 76 20")
                self.assertEqual(card["tile"], {"name": tile, "offset": [offset, 0]})
                self.assertEqual(card["size"], {"width": 1216, "height": 640})
                self.assertEqual(card["geometry"], self.hash)

    def test_the_legend_matches_the_cutaway_legend_indexes(self):
        legend = read_json(self.path("main", "roomid-legend.json"))
        self.assertEqual(legend["rooms"], ship_svg.room_legend(GEOMETRY))
        self.assertEqual((legend["space"], legend["structure"]), (0, 1))

    def test_a_second_run_writes_the_same_bytes(self):
        with tempfile.TemporaryDirectory() as other:
            ship_svg.export_deck_layers(GEOMETRY, other)
            for deck in GEOMETRY["decks"]:
                for name in os.listdir(self.path(deck["id"])):
                    with (
                        open(self.path(deck["id"], name), "rb") as a,
                        open(os.path.join(other, deck["id"], name), "rb") as b,
                    ):
                        self.assertEqual(a.read(), b.read(), name)


if __name__ == "__main__":
    unittest.main()
