# @nexusdi/meridian-deck

The deck runtime of the Meridian docs. A private package, in four entries.

- `@nexusdi/meridian-deck` holds the deck state: `DeckState` (a configurable
  module), the tokens `DECK_OPTIONS`, `DECK_SOURCE`, `DECK_STATE` and
  `DECK_BINDINGS`, and the contracts a source implements. It imports no Pixi.
- `@nexusdi/meridian-deck/maps` holds `DeckMaps`, which runs the map files of
  `@nexusdi/meridian-systems` over the deck state: the tokens `MAP`, `SCENE`
  and `SCENE_RUNNER`, the trigger engine and `ScriptedDeckSource`. It imports
  meridian-systems by `import type` only, an optional peer, so the app passes
  the maps, the scene modules and the door ids in the options.
- `@nexusdi/meridian-deck/view` holds `DeckView`, which exports `DECK_VIEW`
  alone. `DECK_VIEW.attach(canvas)` lights the unlit cutaway with PixiJS and
  resolves on the first presented frame.

The app binds `DECK_SOURCE` in its own global module, declares
`DeckState.forRoot(...)` once and loads the view over it:

```ts
await nexus.load(DeckView, { imports: [BayDeckState] });
await nexus.get(DECK_VIEW).attach(canvas);
```

```ts
await nexus.load(DeckMaps.forRoot({ maps, scenes, doors }), {
  imports: [BayDeckState],
});
const scope = await nexus.createScope({ request: { map: 'console-airlock' } });
await nexus.get(SCENE_RUNNER).open(nexus, scope, {
  imports: [BayDeckState, BayDeckMaps],
});
```

A scope opened with a map applies the map's start state and camera and fires
its `enter` triggers. Each trigger holds its changes under `<mapId>:<triggerId>`
and the scope's dispose releases them. `scope.get(SCENE).cues()` lists the
callouts and announcements the triggers raised.

- `@nexusdi/meridian-deck/testing` holds `FakeDeckSource`, a source a test
  pushes events through. It imports only the main entry.

## The deck art

`@nexusdi/meridian-deck/art/*` serves files and no JavaScript, in
`art/<deck>/` for `lower`, `main` and `upper` and `art/shared/`:

- `base-left.webp` and `base-right.webp`, the painted base (pass `swatch-v2`)
  in two tiles of 1216 by 640 at 32 px/m, each with a `base-<tile>.json`
  sidecar. A sidecar names the view (`deck-<id>`), the origin pixel (64, 320),
  the tile's offset, the paint pass and the masks, lights and legend that go
  with it.
- `roomid-<tile>.png` and `emissive-<tile>.png`, 8-bit masks in the same tiles,
  with a sidecar each, plus `lights.json` in deck pixels and
  `roomid-legend.json`. `ship_svg.py --deck-layers` writes them.
- `atlas-<n>.json` and `atlas-<n>.webp`, a Pixi spritesheet per page of at most
  2048 by 2048. Frames are named `<fixture or door id>@<state>`, anchored at the
  footprint centre and cut to the footprint plus 0.5 m on every side. A painted
  frame also has an `<id>@<state>#emissive` frame whose alpha is the emissive
  mask. `meta.sources` marks each frame `painted` or `generated`. A prop that
  stands on several decks sits in `art/shared/`.

`apps/docs/tools/deck-art-build.mjs` writes the tiles and the atlases from the
painted sources, which are not in the repository:

```sh
node apps/docs/tools/deck-art-build.mjs --paintover <dir> --preview <dir>
```

A generated frame is a flat steel plate drawn from the geometry. A painted
sprite replaces it with a file swap.

## What the state holds

A patch sets rooms (`powered`, `unpowered`, `alarm`), fixtures (the glow:
`online`, `standby`, `offline`), frames (the prop sprite: `on`, `off`,
`damaged`, `open`, `closed`, `default`), doors (`open` or `closed`, with an
optional `cause` code), conduits (`flowing`, `shed` or `broken`, with a level
from 0 to 1) and alarms (a list of `{ code, subject }`). A patch that lists
alarms replaces the whole list. A patch that sets a frame and no glow for an
id gets one: `on` gives `online`, `off` and `damaged` give `offline`, and the
other frames leave the glow to the room.

The store keeps the base state of the source and the bindings. For one event
it collects every binding's patch and applies them as one change. In
development it warns, with both class names, when two patches set the same
id.

`hold(trigger, patch)` lays a patch over the base until `release(trigger)` or
`releaseAll()`. `snapshot()` returns the base with the holds over it, the
later hold winning on an id two holds set, and `snapshot().held` maps each
held id to its trigger (`heldBy(id)` reads one). `setCameraTarget({ deck,
focus, zoom })` sets where the map view looks. Every apply, hold, release and
camera change sends listeners one `DeckChange`.

`FakeDeckSource` has `push(event)` and `state(patch)`. A listener that
subscribes late hears the state so far as one `state` event.

Design: `specs/2026-10-29-meridian-map-runtime-ux.md` section 4.1 and
`specs/2026-10-29-meridian-design-system.md` section 8.2.
