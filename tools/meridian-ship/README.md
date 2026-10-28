# Meridian concept mesh

`build_ship.py` builds the SV-01 Meridian blockout in Blender from
`examples/meridian-systems/deck/meridian.geometry.json`, the layout the deck view
also draws from, and renders the concept views. Edit the geometry file, run the
script, and the hull, the rooms, the doors and the conduits move together.

## Run

Blender 5.2 or later, no add-ons. From the repo root:

```sh
blender --background --factory-startup \
  --python tools/meridian-ship/build_ship.py -- \
  --out <dir> --blend <dir>/sv01-meridian.blend
```

On macOS `blender` is `/Applications/Blender.app/Contents/MacOS/Blender`.

| Option       | Default                        | Meaning                                 |
| ------------ | ------------------------------ | --------------------------------------- |
| `--out`      | required                       | directory for the PNG renders           |
| `--views`    | `side,top,hero,cutaway,decks`  | which views to render, comma separated  |
| `--width`    | `2048`                         | width of the side, top and hero renders |
| `--blend`    | none                           | also save the scene as this `.blend`    |
| `--geometry` | the meridian-systems deck file | another geometry file of the same shape |

The views:

- `sv01-side.png`: orthographic, from port.
- `sv01-top.png`: orthographic, from above, bow to the left.
- `sv01-hero.png`: three-quarter perspective from starboard, in Eevee.
- `sv01-cutaway.png`: from port with the port hull removed, every compartment in its
  own colour with its id, every door id, the tanks and the conduits.
- `sv01-deck-lower.png`, `sv01-deck-main.png`, `sv01-deck-upper.png`: one top-down
  plan per deck.

Every view but the hero renders in Workbench. A run takes a few seconds and under
1 GB of memory. The script draws its randomness from one seed and writes no stamp
metadata, so the same geometry gives the same renders, pixel for pixel.

## Style

The repo's lint and CI cover TypeScript alone. `ruff.toml` here pins the
script's format and lint rules: run `uvx ruff format` and `uvx ruff check` in
this folder before committing a change to the script.

## Checking the geometry

`examples/meridian-systems/src/geometry/ship-geometry.test.ts` checks the file
before any render: every room inside the hull, no overlaps, every door on a face
both its sides share, every conduit leg inside one compartment. Run it with
`npx nx test @nexusdi/meridian-systems`.
