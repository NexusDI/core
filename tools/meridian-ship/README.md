# Meridian concept mesh

These scripts draw the SV-01 Meridian from
`examples/meridian-systems/deck/meridian.geometry.json`, the layout the deck
view also draws from. Edit the geometry file, rerun, and the hull, the rooms,
the doors and the conduits move together.

- `ship_svg.py` holds the hull math and projects the geometry to SVG: the side
  and top silhouettes, the side cutaway, and one plan per deck. It needs plain
  Python 3 and nothing else.
- `build_ship.py` builds the concept mesh in Blender from the same hull math
  and renders the raster views. The mesh is a drawing aid for the 2D views:
  lofted hull volumes under a bevel, one layer of plates, and the exterior
  parts that change the silhouette.

## Run

The SVGs alone, from the repo root:

```sh
python3 tools/meridian-ship/ship_svg.py --out <dir>
```

The mesh, the renders and the SVGs need Blender 5.2 or later, with no add-ons:

```sh
blender --background --factory-startup \
  --python tools/meridian-ship/build_ship.py -- \
  --out <dir> --blend <dir>/sv01-meridian.blend
```

On macOS `blender` is `/Applications/Blender.app/Contents/MacOS/Blender`.

| Option       | Default                                | Meaning                                 |
| ------------ | -------------------------------------- | --------------------------------------- |
| `--out`      | required                               | directory for the renders and the SVGs  |
| `--views`    | `side,top,cutaway,hero,silhouette,svg` | which outputs to write, comma separated |
| `--width`    | `2048`                                 | width of the side, top and hero renders |
| `--prefix`   | none                                   | prefix for the silhouette files         |
| `--blend`    | none                                   | also save the scene as this `.blend`    |
| `--geometry` | the meridian-systems geometry file     | another geometry file of the same shape |

The outputs:

- `sv01-side.png`, `sv01-top.png`: orthographic, from port and from above, bow
  to the left, in Workbench.
- `sv01-cutaway.png`: from port with the port half removed, every compartment in
  its own colour with its id, the fixtures with their names, the doors, the
  tanks and the conduits.
- `sv01-hero.png`: three-quarter perspective from starboard, in Eevee, for the
  front page.
- `silhouette-side.png`, `silhouette-top.png`: flat black on white, for
  silhouette studies.
- `sv01-side.svg`, `sv01-top.svg`, `sv01-cutaway.svg`, `sv01-deck-<deck>.svg`:
  vector outlines in metres, one SVG unit per metre. Each room carries
  `data-room`, each fixture `data-fixture` and each door `data-door`.

A run takes a few seconds and under 1 GB of memory. Nothing in the scripts is
random and the PNGs carry no stamp metadata, so the same geometry gives the
same files, byte for byte.

## Style

The repo's lint and CI cover TypeScript alone. `ruff.toml` here pins the
scripts' format and lint rules: run `uvx ruff format` and `uvx ruff check` in
this folder before committing a change.

## Checking the geometry

`examples/meridian-systems/src/geometry/ship-geometry.test.ts` checks the file
before any render: every room inside the hull, no overlaps, every door on a face
both its sides share, every conduit leg inside one compartment. Run it with
`npx nx test @nexusdi/meridian-systems`.
