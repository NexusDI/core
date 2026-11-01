# Meridian map runtime, MeridianOS and the Academy: UX

Status: proposed, 2026-10-29. The open questions are decided: section 13 records each
decision, which the architect proposed and the tech lead ruled on 2026-10-30 under the
owner's delegation of these PRs.

Packages: no published package changes. New private package: `internal/meridian-deck`
(`@nexusdi/meridian-deck`), the map runtime, beside `internal/meridian-ui`. The bridge
console, the federation shell and `apps/docs` take it as a workspace dependency. It has two
entries: `.` holds the deck state and imports no Pixi, and `./view` holds the Pixi view. The
front page's pre-flight bay mounts `./view` at 0.4 to light its unlit cutaway (OR5, TL23).
`examples/meridian-systems` gains the map files, the map schema and two geometry fields.

Depends on:

- `specs/2026-10-29-meridian-design-system.md` on `release/0.4`, approved and binding:
  section 4 (colour and the dark-only surfaces), 7 (components), 8 (ship art and the map
  format), 9 (motion), 10 (accessibility) and 11 (surfaces). This spec designs what its
  sections 14 and 11.5 leave to "the demo apps' UX spec" and "the full Academy UX spec".
- `specs/2026-10-21-meridian-ship-systems-design.md` on `release/0.4`: section 6 (the
  feature map), 7.2 and 7.3 (the console and federation routes), 16.1 to 16.5 (the ship,
  the compartments, the hull sections and their code, the conduits, the network overlay).
- `specs/plans/2026-10-28-demo-refactor.md` on `release/0.4`: the module graph of section
  3.1, the seam of section 3.9 (`components/` and `hooks/`), `POST /sections/ftl` (T-Q1),
  `GET /profile` (T23) and the UX bugs of section 6.
- `specs/2026-10-28-extension-points-design.md` on `release/0.4`: K1 (a multi token
  collects every published contribution, and `load()` rejects one with
  `NEXUS_LOAD_CONTRIBUTION`), K2 and K4.
- `specs/2026-09-23-docs-site-design.md`: section 11 (the
  playground runtime and its sandbox), 12 (the graph and trace views), 13 (the Academy),
  14.4 (the mission guard) and 16 (accessibility and budgets).
- `examples/meridian-systems/deck/meridian.geometry.json` at `9418d8a4`: 3 decks, 14
  compartments with 42 fixtures, 16 doors and 37 conduits. Section 7 replaces
  `bridge.station-bank` with four fixtures (Q2), which brings the geometry to 45 fixtures.
- `specs/2026-10-29-site-ux.md`, in its own PR: U2, U4, section 9 (the `Schematic`
  component) and section 11 (the service worker).

## 1. Problem

The hands-on review of the demo apps on 2026-10-24 ended on one line: a user finishes the
console knowing the ship and knowing nothing about NexusDI. No page names a module, a scope, a lazy edge or a loaded section. The FTL drive reads "offline" when its module has not loaded. The request-scoped
flight log loses an entry and looks like a bug. The demos run the container well and show
none of it.

The design system gives every surface one look and one art pipeline, and makes each demo
app and each Academy mission a map on a shared 2D game runtime. It leaves open how that runtime behaves and how the two surfaces on it lay out and play. This spec designs both under one rule from the owner: the demos
are a test case for the container, so every UX choice shows a container concept.

This spec holds to two constraints:

1. Every number stays in the DOM. The canvas is art, and a reader with a screen reader, a keyboard, forced colours or no WebGL gets every reading and every control from the DOM layer.
2. The runtime is one package. The demo apps (the bridge console and the federation shell)
   and the Academy mount it. The front page's pre-flight bay mounts its `./view` entry at
   0.4 to light the unlit cutaway (OR5), and the other front-page scenes may mount it after
   0.4 (site UX U4). A surface differs from another only in its maps and the source of its
   events.

## 2. Decisions

### 2.1 The owner's decisions this spec builds on

| Date       | Decision                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-11 | Every package beyond core gets at least one Academy mission. A mission set may start from whichever earlier solution it needs.                                           |
| 2026-10-12 | The Academy feels like a game, with smooth transitions and a persistent player character. Service workers, Cache Storage, preloading and wasm are allowed.               |
| 2026-10-12 | The player character is a cadet avatar. The reader is an unnamed cadet ("you") with a visible avatar.                                                                    |
| 2026-10-12 | Full progression: rank from completed missions and sets, badges per set, stats and cosmetic unlocks for the avatar or the ship, all kept in the browser.                 |
| 2026-10-25 | The OS desktop is a bridge station on a larger bridge. Other stations and crew seats sit around it, and the bridge windows show space behind.                            |
| 2026-10-28 | The demos are a test case for the container. A workaround in a demo that hides a container gap is the wrong answer (demo refactor, O1).                                  |
| 2026-10-29 | The Pixi ship view is a 2D game, and each demo app and each Academy mission is a map. Maps extend `meridian.geometry.json` and name fixtures by id (design system, 2.1). |
| 2026-10-29 | Runtime art: unlit painted deck bases, prop sprites per state, masks from the geometry, light from Pixi light sprites (design system, V5).                               |
| 2026-10-29 | Every UX choice in the demos shows a container concept: modules, providers, exports, scopes, lazy loading and multi-token contributions.                                 |
| 2026-10-29 | The Academy gets its full UX spec now and is built after the 0.4 launch. The demo apps and the Academy run in the dark theme alone.                                      |
| 2026-10-29 | Interactions make sense from the container first and the ship second. Each control is one real container operation, and a ship effect follows a container outcome.       |

The rows of 2026-10-11 and 2026-10-12 come from the owner's messages, and this spec records
them in the repo for the first time.

### 2.2 Decisions of this spec

| #   | Decision                                                                                                                                                                                                                             | Section   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| M1  | The map runtime is a NexusDI graph in the browser. Its parts are interface-first providers, so the runtime itself shows modules, exports, scopes, `load()` and multi-token contributions.                                            | 4.1       |
| M2  | The DOM layer renders from the deck state before Pixi loads. Pixi loads as a section after the panels, and the DOM layer and every control work without it.                                                                          | 4.1, 4.11 |
| M3  | A map file is data alone: decks, camera, starting states, declarative triggers and an optional scene module named by id. No map holds code or a position.                                                                            | 4.5       |
| M4  | Each ship system contributes a deck binding to the multi token `DECK_BINDINGS`, which turns a telemetry frame into fixture states, room light, door states and alarms. A new system adds a binding and edits nothing.                | 4.7       |
| M5  | A provider sits at a fixture. `shipNotes` and the docs ship's annotator add a `fixture:` note, so the overlay and the provider card place each provider on the deck from the real graph.                                             | 4.7       |
| M6  | The bridge console is one station whose panels are contributions. The federation shell is the whole bridge, and each remote is a station.                                                                                            | 5.2, 5.3  |
| M7  | The demo desktop's one orchestrated motion is the FTL section load. The Academy's is the rank-up, as the design system names it.                                                                                                     | 5.6, 6.8  |
| M8  | The Academy hub is a cold ship, and each passed mission powers its hull section for good, package sets included, so the reader's progress is the lit ship. The tech lead settled it on 2026-10-30 under the owner's delegation (Q9). | 4.6, 6.1  |

## 3. The look in one paragraph

The design system fixes the palette, the type, the plates and the motion tiers, and this
spec adds no colour and no face. The one bold element on every screen is the lit deck: warm `lamp` pools in powered rooms, dark rooms where the router shed the load, cyan conduits and a red pulse where an alarm sits. Everything around it stays quiet. Panels are flat plates with placard titles and tabular Plex Mono readouts in `data`. Controls turn amber only where the reader can act. A reader learns
the ship's state from the light before reading a number, and every number sits one glance
away in the DOM.

## 4. The map runtime

### 4.1 Where it lives and how it is wired

`internal/meridian-deck` holds the runtime. It reads the ship's layout from
`@nexusdi/meridian-systems/geometry` (`SHIP_GEOMETRY`), the one subpath of the library a
frontend imports. The console's bundle check keeps refusing the library's main entry.

The runtime is two layers, so the DOM works before the canvas exists:

- The deck state, in the app's static client graph. It holds the map, the fixture states,
  the room light, the alarms and the camera target, and it renders the DOM layer. It loads
  with the page.
- The deck view, a section the app loads with `lazySection` after its panels hydrate. It
  holds the Pixi application, the layers, the camera and the input. When it fails to load, the app
  shows the vector schematic in its place (4.11).

The tokens, all interface-first:

| Token             | Interface         | Bound to                                                                                 | Module              | Lifetime                   |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------- | ------------------- | -------------------------- |
| `DECK_OPTIONS`    | `DeckOptions`     | the `forRoot()` value: the scene, the palette, `reducedMotion`                           | `DeckState`         | value, exported            |
| `DECK_SOURCE`     | `IDeckSource`     | one source class of 4.8, in the app's own global module                                  | the app             | singleton, plain           |
| `DECK_BINDINGS`   | `IDeckBinding`    | one class per ship system, multi token                                                   | each binding module | singleton                  |
| `DECK_STATE`      | `IDeckState`      | `DeckStateStore` over `DECK_SOURCE` and `all(DECK_BINDINGS)`                             | `DeckState`         | singleton                  |
| `MAP`             | `MapDefinition`   | `mapOfRequest`, a factory over `REQUEST`                                                 | `DeckState`         | scoped                     |
| `SCENE`           | `IScene`          | `MapScene`: this map's triggers, state overrides and scene hooks                         | `DeckState`         | scoped                     |
| `SCENE_RUNNER`    | `ISceneRunner`    | `SceneRunner`, which a loaded scene module attaches to                                   | `DeckState`         | singleton                  |
| `DECK_CAMERA`     | `IDeckCamera`     | `MetreCamera`, which moves to the camera target in `DECK_STATE`                          | `DeckView`          | singleton, private         |
| `DECK_COMPOSITOR` | `IDeckCompositor` | `LayerCompositor` over `all(DECK_LAYERS)`                                                | `DeckView`          | singleton, private         |
| `DECK_LAYERS`     | `IDeckLayer`      | one class per layer of 4.2, multi token, private to `DeckView`                           | `DeckView`          | singleton                  |
| `PIXI_APP`        | `IPixiHost`       | `createPixiHost`, an async factory on `WebGLRenderer`; its dispose destroys the renderer | `DeckView`          | singleton, private         |
| `DECK_VIEW`       | `IDeckView`       | `DeckViewController`: `attach(canvas)`, `detach()`, `onStatus()`                         | `DeckView`          | singleton, the only export |

```ts
// internal/meridian-deck/src/view/deck-view.module.ts
export const DeckView = defineModule({
  name: 'DeckView',
  // No import of DeckState: the app loads this module over its own DeckState
  // instance (see the load fix below). DECK_OPTIONS and DECK_STATE come in
  // through that load import.
  providers: [
    // Private: panels and scene hooks set the camera target and the holds in
    // DECK_STATE, which loads with the page. Only DeckView reads Pixi.
    provide(PIXI_APP, { useFactory: createPixiHost }),
    provide(DECK_CAMERA, { useClass: MetreCamera }),
    provide(DECK_LAYERS, { useClass: BaseLayer }),
    provide(DECK_LAYERS, { useClass: PropLayer }),
    provide(DECK_LAYERS, { useClass: LightLayer }),
    provide(DECK_LAYERS, { useClass: ConduitLayer }),
    provide(DECK_LAYERS, { useClass: OverlayLayer }),
    provide(DECK_LAYERS, { useClass: FocusLayer }),
    provide(DECK_COMPOSITOR, { useClass: LayerCompositor }),
    provide(DECK_VIEW, { useClass: DeckViewController }),
  ],
  exports: [DECK_VIEW],
});
```

`DECK_VIEW` is the one export. `IDeckView` holds no Pixi type: `attach(canvas)` resolves on
the first frame the canvas presents and rejects on failure, `detach()` frees the renderer,
and `onStatus(listener)` reports `lost` and `restored`. The front page's bay provides the
`BaseLayer` and `LightLayer` alone; the other layers join as their surfaces need them.

The wiring has two rules that the first draft of this block broke (OR5, TL23):

- A `forRoot()` call carries the options token alone, and a `forRootAsync()` factory's deps
  resolve inside the module, so `DeckState` cannot receive `DECK_SOURCE` from the module
  that imports it (issue #308). The app binds `DECK_SOURCE` in its own `global: true` module
  and exports it, and `DeckState` reads it as a global.
- A module with `options` fails with `NEXUS_MODULE_OPTIONS_MISSING` when it is imported
  bare, so `imports: [DeckState]` could not compile. The app declares
  `const BayDeckState = DeckState.forRoot(...)` once, imports it in its root and runs
  `load(DeckView, { imports: [BayDeckState] })`. A load import must already be in the graph
  (`NEXUS_LOAD_IMPORT`, reason `not-in-graph`). `DeckState` exports `DECK_OPTIONS` beside
  `DECK_STATE`, so the view reads the options through the load import. The deck runs in its
  own container and never in the seed graph.

Four container facts show in this wiring, and the console's own graph view draws them
(5.5):

- `PIXI_APP` stays private. A panel provider in a module that imports `DeckView` and asks
  for it fails the check with `NEXUS_MISSING_PROVIDER`: "PixiHost is provided in DeckView,
  which does not export it." A root `get(PIXI_APP)` throws `NEXUS_NOT_VISIBLE`.
- `DECK_LAYERS` holds private contributions that `LayerCompositor` reads in its own module.
  `DECK_BINDINGS` holds published contributions, which the binding modules export at
  startup so `DeckStateStore` reads them across the graph (K1).
- `DeckView` loads with `load()`, and the host behind `PIXI_APP` destroys the renderer in its
  dispose.
- Each map opens a scope. The deck screen renders inside a `ScopeProvider` whose request
  names the map, so `MAP` and `SCENE` belong to that map. A route change disposes the scope,
  and `MapScene`'s dispose removes the map's display objects while `PIXI_APP` lives on. The
  package augments `NexusRequest` with `map?: MapId`, as `meridian-systems` augments it
  with `compartment`.

`load()` rejects a published contribution, so a scene module that loads with a map
attaches its hook to `SCENE_RUNNER` in `onInit` and detaches it in its dispose, the pattern
`JumpDrive` uses with the tick loop. The map's scope opens before its scene module loads,
so a read of a scene token from that scope throws `NEXUS_LOADED_AFTER_SCOPE` until the
runtime calls `await scope.extend()` after the load.

### 4.2 Layers

The deck view draws eight layers, bottom to top. Layers 1 to 3 draw the base, the props and the light of design system 8.2, with the light clipped by its masks. Layers 4 and 5 are the vector layers of 8.4, and layers 6 to 8 belong to this spec. While the overlay is on, layer 4 dims to 40%, so a dashed DI edge never reads as a duct (8.4).

| #   | Layer     | Draws                                                                                                                                             | Source                                      |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | base      | the painted deck base, two tiles per deck, on the `screen` floor                                                                                  | the painted deck bases and their sidecars   |
| 2   | props     | one sprite per fixture and door, in its current state frame                                                                                       | the prop sprites, atlases per deck          |
| 3   | light     | lamp, glow and alarm light sprites into a half-resolution light texture, clipped per room, multiplied over 1 and 2; the emissive mask added after | the room-id and emissive masks              |
| 4   | conduits  | power, coolant and atmosphere lines with the state hues of design system 8.4                                                                      | `conduits` in the geometry                  |
| 5   | overlay   | the network overlay: providers at fixtures, DI edges, empty sockets                                                                               | the graph (`GET /graph` or the run's graph) |
| 6   | focus     | the focus outline in `action`, the selected item's outline in `data`, the scope brackets of 5.6 in `data`                                         | the DOM layer's focus and the deck state    |
| 7   | callouts  | `HoloLabel` plates with leader lines, placed by the camera over the canvas                                                                        | the deck state and the map's triggers       |
| 8   | DOM layer | the deck directory: every room, door, fixture and alarm as text and controls                                                                      | the deck state                              |

Layers 7 and 8 are DOM, so their text scales with the reader's text size and reaches assistive technology. Layer 7 follows the camera through one CSS
transform per frame. Layer 8 sits beside the canvas (4.10). The interactive mask is data
and never draws. The input of 4.4 reads it.

### 4.3 Decks, camera and zoom

A map names one or more decks. The deck view shows one deck at a time, with one tab per deck in the screen's toolbar. A tab for a hidden deck carries the alarm
glyph and a count when an alarm sits on that deck, so no alarm hides behind a tab.

An overview mode stacks every deck the map names, fore to aft aligned, since one master
plan places them on the same x axis. The Academy hub and the federation bridge open in it.
Overview mode is read-only: a click on a room opens that deck at the section zoom.

The camera works in metres on the geometry's axes. It renders at an integer number of CSS
pixels per metre, so hull lines sit on whole pixels (design system 6.2). The wheel, a pinch, the zoom buttons and the keyboard move between the steps 6, 8, 12, 16, 24, 32 and 48, and a gesture between
steps settles on the nearest one after 140 ms. Four named levels give the keyboard and the
map files fixed targets:

| Level   | Pixels per metre | Fits                                                   | Shows                                                             |
| ------- | ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| ship    | 6 or 8           | the 76 m frame on a phone or in overview               | room light, alarms, deck outline; no labels, no conduit flow      |
| deck    | 12               | one deck from 1600 CSS pixels; narrower screens pan it | room stencils, conduits with flow, door states                    |
| section | 24               | one hull section, such as the airlock and the habitat  | fixture outlines on hover, callouts, the overlay's provider names |
| room    | 48               | one room                                               | every callout and readout the map names for the room              |

At 12 pixels per metre one deck draws 912 by 240 CSS pixels with its 2 m margin. The
camera clamps to the deck frame and keeps at least 25% of the deck in view. `focus(id)`
centres a room, door or fixture by its box in the geometry and picks the map's zoom for it,
or the section level.

A camera move that answers the reader (a focus from the DOM layer, a deck tab, a trigger the reader's run fired, a route change) animates on the console tier, 200 ms. Under reduced motion it
cuts. The camera never moves on its own.

Design system 8.3 places the origin at pixel (64, 320) on a 76 by 20 m frame at 32 pixels
per metre. `ship_svg.py` writes the deck viewBox (−2, −10, 76, 20), so the frame runs from
y = −10 m to 10 m with the centreline at y = 0. The runtime places every image by its
sidecar alone, so it reads (64, 320) from the sidecar.

### 4.4 Input

The canvas takes pointer input. Keyboard focus never enters the canvas: it moves through
the DOM layer, and the canvas follows it (4.10).

| Input    | Pointer or touch                          | Keyboard (focus in the deck region)               | Result                                                           |
| -------- | ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| hover    | pointer over a hit area                   | focus a row in the deck directory                 | the focus outline and a one-line callout: the name and its state |
| select   | click or tap                              | Enter on a row                                    | opens the room, door or fixture card in the side panel (5.4)     |
| pan      | drag; one-finger drag                     | arrow keys pan by 2 m, Shift for 8 m              | moves the camera                                                 |
| zoom     | wheel, pinch, the + and − buttons         | `+` and `-` step; `0` returns to the map's camera | moves to the next step of 4.3                                    |
| deck     | a deck tab                                | `[` and `]`                                       | shows the next deck down or up                                   |
| overlay  | the Network toggle in the station toolbar | `n`                                               | turns the network overlay on or off                              |
| back out | click empty floor                         | Escape                                            | clears the selection; a second Escape leaves the deck region     |

The single-key shortcuts act only while focus sits in the deck region, and a "Keyboard
shortcuts" switch in the station toolbar turns them off (WCAG 2.1.4). `?` opens the list.

Hit testing reads the interactive mask at the pointer's metre position, so a fixture's hit
area is its footprint. A door's footprint at 12 pixels per metre is 18 pixels wide, so the
hit area grows to 24 CSS pixels at least, and to 44 on a coarse pointer (design system 10).
Two hit areas that overlap after growing go to the one whose centre is nearer.

### 4.5 The map file

A map is one JSON file in `examples/meridian-systems/deck/maps/`, named `<id>.map.json`.
`maps/map.schema.json` describes the format, and the geometry test validates every map
against it and checks that every id it names exists in the geometry (design system 8.5).
A map names ids alone and holds no position, so the layout keeps one copy.

```json
{
  "$schema": "./map.schema.json",
  "id": "console-airlock",
  "version": 1,
  "title": "Airlock drill",
  "surface": "demo",
  "decks": ["main", "lower"],
  "camera": { "deck": "main", "focus": "airlock", "zoom": "section" },
  "start": {
    "doors": { "habitat-airlock": "closed", "airlock-outer": "closed" },
    "rooms": { "shuttle-bay": { "light": "off" } }
  },
  "directory": ["airlock", "habitat-airlock", "airlock-outer", "habitat"],
  "callouts": [
    { "at": "airlock", "show": ["pressure", "pump"], "zoom": "section" },
    { "at": "airlock-outer", "show": ["difference"], "zoom": "section" }
  ],
  "firstVisit": {
    "at": "airlock-outer",
    "text": "PressureInterlock guards this hatch. Try to open it."
  },
  "triggers": [
    {
      "id": "outer-refused",
      "when": { "refused": "MERIDIAN_INTERLOCK", "door": "airlock-outer" },
      "then": [
        { "camera": "airlock-outer" },
        { "callout": "airlock-outer", "show": ["chain"] }
      ]
    }
  ],
  "scene": null
}
```

| Field           | Holds                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `version` | the map's id and a version the Academy's progress keys by, as a mission's `version` does                                                                   |
| `surface`       | `demo`, `academy` or `scene` (the front page); the guard applies the rules of each                                                                         |
| `decks`         | the decks the map loads, in load order; the first one shows first, and the tabs keep the physical order                                                    |
| `camera`        | the opening deck, the focus id and a named level or a step of 4.3                                                                                          |
| `start`         | starting states: `fixtures` by id to one of the fixture's `states`, `doors` to `open` or `closed`, `rooms` to `light` and `alarm`                          |
| `directory`     | the ids the DOM layer lists first, in reading order; the rest follow by deck and position                                                                  |
| `callouts`      | which readouts a callout shows at which id, at most four per callout as `HoloLabel` allows (design system 7.3), from the readout names the bindings export |
| `firstVisit`    | one callout on the reader's first visit to the map, dismissible, never shown again                                                                         |
| `triggers`      | condition and effect pairs (4.6)                                                                                                                           |
| `scene`         | an optional scene module id (4.6), or null                                                                                                                 |
| `goal`          | Academy maps: the state a passing solution reaches, which the mission guard asserts (6.9)                                                                  |

The geometry gains two fields on each fixture, as design system 8.5 sets: `states`, the
list of state frames its prop sprite holds (one of `on`, `off`, `damaged`, `open`,
`closed`, or `default` for a prop with one frame), and `emissive`, true for a screen. A
lamp housing carries the flag on its light in the geometry's `lights` list (design system 8.5). Each door has the states `open` and `closed`. A map's `start` and every
effect may only name a state the fixture lists, and the guard checks it.

The format is versioned by `$schema`. A runtime that reads a map with a newer schema
version shows the deck with no triggers and logs the version it lacks, so an old cached
runtime never misreads a new map.

### 4.6 Triggers and scene hooks

A trigger pairs a condition with a list of effects. A map author writes the common case as triggers, and writes a scene hook for what a trigger cannot say.

The conditions:

| `when`                                                                                                 | Fires when                                                                                          | Source               |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------- |
| `{ "enter": true }`                                                                                    | the map's scope opens                                                                               | every source         |
| `{ "select": "<id>" }`                                                                                 | the reader selects the room, door or fixture                                                        | every source         |
| `{ "record": "<path>", "is": <value> }`, or `"above"` and `"below"`                                    | a telemetry frame's record crosses the value, such as `{ "record": "ftl.status", "is": "charged" }` | telemetry            |
| `{ "alarm": "<code>", "room": "<id>" }`                                                                | the alarm is raised in the room                                                                     | telemetry            |
| `{ "refused": "<code>", "door": "<id>" }`                                                              | a command answer refuses with the code; `door`, `room` or `system` narrows it                       | telemetry            |
| `{ "provider": "<fixture id>", "event": "construct" }`, or `"init"`, `"dispose:instance"`, `"missing"` | the provider at the fixture (4.7) has the trace event, or a check names it missing                  | run, telemetry graph |
| `{ "objective": "<id>", "status": "pass" }`, or `"fail"`                                               | an Academy objective reports                                                                        | run                  |
| `{ "loaded": "<module name>" }`                                                                        | a section joins the graph, such as `FtlDrive`                                                       | run, telemetry graph |
| `{ "passed": "<mission id>" }`                                                                         | the progress stores hold a pass of any version of the mission; valid on `academy-hub` alone         | progress             |

Record paths and codes belong to `meridian-systems`, and the maps live in its `deck/`
folder, so the owner of the vocabulary owns the files that name it (P1). The map schema
lists the record paths and the codes from the library's exported types, and the guard
refuses a path the snapshot type lacks.

The effects:

| `then`                                                               | Does                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `{ "set": "<fixture or door id>", "state": "<state>" }`              | holds the prop in the state over the bindings until the map's scope closes |
| `{ "room": "<id>", "light": "on" }`, or `"off"`, `"alarm"`           | holds the room's light over the bindings                                   |
| `{ "conduit": "<id>", "state": "broken" }`, or `"flowing"`, `"shed"` | holds the conduit's hue over the bindings                                  |
| `{ "camera": "<id>", "zoom": "<level>" }`                            | moves the camera (4.3)                                                     |
| `{ "callout": "<id>", "show": [...] }` or `"text": "..."`            | opens a callout                                                            |
| `{ "announce": "..." }`                                              | queues a sentence for the polite live region (4.10)                        |
| `{ "release": "<trigger id>" }`                                      | drops the holds another trigger set                                        |

The bindings set the base state on every telemetry frame, and trigger holds sit over it,
so a map can stage a scene on a live ship without fighting the next frame. A trigger fires
once per crossing: a record that stays above its value fires no second time until it
drops below and crosses again.

On a `scene` or `academy` map, an effect that lights, darkens or alarms a room, a fixture
or a conduit fires only from a container condition: `provider`, `loaded`, `objective`,
`passed`, or a `refused` whose code an interceptor raised. A `passed` condition counts as a
container condition, since a pass comes from a real run, and the guard refuses it on any
map but `academy-hub`. An `enter` or `select` trigger may move the
camera, open a callout or announce, and lights nothing. The guard refuses a map that
breaks the rule, so no ship effect on those surfaces stands without a container outcome.
A `demo` map keeps its telemetry triggers, since the simulation's records are the ship's
own state.

A scene hook is a class in a scene module that the map names by id. The app registers its
scene modules in a record from id to a dynamic import, and the runtime runs
`load(module, { imports: [BayDeckState] })` when the map opens (K4), where `BayDeckState` is the app's one `DeckState.forRoot()` instance, which the root already imports. A map names a module by id. The format has no field for a URL or code, so a map file cannot make the reader's browser run code the
site did not build and test, the rule the docs-site seeds follow (11.9).

```ts
// internal/meridian-deck/src/scene/contracts.ts
export interface ISceneHook {
  onEnter?(context: SceneContext): void | Promise<void>;
  onEvent?(event: DeckEvent, context: SceneContext): void;
  onExit?(): void;
}
```

`SceneContext` gives a hook `state` (holds, releases and the camera target, as the effects set them), `camera`,
`callout` and `announce`. `SceneContext` holds no Pixi type. A front-page scene that the site UX spec assigns to a deck map runs as a scene hook on a `surface: "scene"` map; 0.4 assigns none. The demo maps need none at 0.4. An
Academy mission uses a hook only for a step its triggers cannot express, and the mission
guard runs the hook headless (6.9).

### 4.7 The state that drives the art

`DeckStateStore` holds one record per room, door, fixture and conduit, and draws nothing.
The layers and the DOM layer read it. Four kinds of state reach the art:

- A fixture's state picks its prop frame. A binding sets it from the system's record: the
  FTL core's `ftl-core.ring` is `off` while `ftl.status` is `offline`, `on` in every other status, and `damaged` under a fire in its room.
- A room's light is `on`, `off` or `alarm`. A pressurised room is `on` while the
  `life-support` load has an allocation above zero and `off` when the router sheds it,
  since the life-support conduit ends at each room's devices (ship-systems 16.4).
  Engineering, where the router sits, is `on` while the reactor's electric output is above
  zero. A room that goes `off` keeps its emissive glow where a powered screen sits.
  The shuttle bay and the drone bay are `pressurised: false` in the geometry, and the
  life-support conduit reaches neither. On demo maps both bays stay dark apart from their
  emissive mask, and their DOM rows read "Unpressurised, no lighting load" with the standby
  status. An Academy map lights them only from a container condition (4.6).
- An alarm in `safety.alarms` sets the light of its subject room to `alarm`, which adds the
  1 Hz `alarm` light sprite of design system 9.2 over the room's other light. An alarm
  whose subject is a load, such as `LOAD_SHED`, marks that load's conduit `shed` and lights
  no room. A code no binding knows raises the banner and lights no room (P2).
- A door reads `open` or `closed` from the snapshot's doors. A door that `DECOMPRESSION`
  closed draws its outline in `alarm`, and its row in the DOM layer says why.

Conduits take their hue and brightness from the snapshot's power and coolant records, as design system 8.4 sets.

A binding is one class per ship system:

```ts
// internal/meridian-deck/src/bindings/contracts.ts
export interface IDeckBinding {
  /** Turns one frame into the states this system owns, and nothing else. */
  patch(frame: ShipReading, geometry: ShipGeometry): DeckPatch;
  /** The readouts a map's callouts may name for this system's rooms. */
  readonly readouts: readonly ReadoutDefinition[];
}
export const DECK_BINDINGS = new MultiToken<IDeckBinding>('DeckBinding');
```

`ShipReading` comes from the library's main entry by `import type`. Each binding module
(`EngineeringDeck`, `LifeSupportDeck`, `SafetyDeck`, `CommsDeck`, `HelmDeck`, `FtlDeck`,
`WeaponsDeck`) binds one class and exports `DECK_BINDINGS`, so its contribution reaches
`DeckStateStore` across the graph (K1). A patch names only ids its system owns, and a unit
test per binding asserts that against the hull sections of ship-systems 16.3. Two patches
that set one id are a defect the store reports in development.

A provider sits at a fixture. `shipNotes` gains a `fixture: <id>` note for each provider
whose hull section has a fixture that stands for it: `REACTOR` at `reactor-bay.vessel`,
`POWER_ROUTER` at `engineering.power-router`, `NAV_CHARTS` at `chart-room.plot-table`,
`COMMS_ARRAY` at `comms-relay.console`, `FTL_DRIVE` at `ftl-core.ring`, and so on. The docs
ship's annotator in `examples/meridian` does the same for its own tokens. A provider with
no fixture draws at its hull section's centre, and a module with no hull section draws in
the computer core (ship-systems 16.5). `@nexusdi/meridian-systems/geometry` exports
`fixtureOf(notes)`, which reads the note, so no other package parses the note's text (P4).

### 4.8 Sources

`DECK_SOURCE` turns what a surface knows into `DeckEvent`s. One interface, five classes:

| Class                 | Surface                            | Reads                                                                                         |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `TelemetryDeckSource` | console, federation shell          | `useShipReading()` frames over `TELEMETRY_CLIENT`, command answers, `GET /graph` after a load |
| `RunDeckSource`       | Academy missions                   | the runner messages of docs-site 11.5: `graph`, `trace`, `test`, `error`, `done`              |
| `ProgressDeckSource`  | Academy hub                        | the progress stores: one `passed` event per mission with a pass of any version                |
| `ScriptedDeckSource`  | front-page scenes after 0.4, tests | a fixed list of events, stepped by a scene hook or a test                                     |
| `FakeDeckSource`      | unit and route tests               | events a test pushes, from `@nexusdi/meridian-deck/testing`                                   |

Front-page explorables bundle core and their scenes as ordinary client chunks (site UX
U2), so they use no `RunDeckSource`. Front-page scenes come after 0.4.

A route test overrides `DECK_SOURCE` with `FakeDeckSource` and asserts the DOM layer, so
the tests never need WebGL.

### 4.9 Performance budgets

The budgets are soft. A build reports each figure against its row and fails nothing until
a release cut reviews them.

| Budget                                                           | Limit                                                                                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| the deck view section, Pixi and the layers                       | 260 kB gzipped; measured 110 kB for `WebGLRenderer` with the base and light layers (the `Application` import measures 153 kB) |
| the deck state, the bindings and the DOM layer in the first load | 20 kB gzipped over the console's first load today                                                                             |
| art for one deck: the base tiles and the prop atlas pages        | 1.2 MB transferred, WebP                                                                                                      |
| GPU textures for a three-deck map                                | 96 MB; a deck base is 6.2 MB as RGBA, an atlas page 16 MB                                                                     |
| light sprites per deck                                           | 48; the light texture renders at half the canvas resolution                                                                   |
| frame time with an animation running                             | 6 ms of main-thread time at 1440 by 900, on a laptop GPU of 2020                                                              |
| a telemetry frame: bindings, diff and DOM update                 | 2 ms                                                                                                                          |
| deck view interactive after its chunk arrives                    | 1.5 s with the CPU throttled four times                                                                                       |
| interaction to next paint, a camera move included                | 200 ms                                                                                                                        |
| cumulative layout shift                                          | 0.05; the deck frame reserves its box before the canvas mounts                                                                |

The ticker runs only while something animates: an alarm pulse, a conduit's flow, a camera
move or a cross-fade. A still ship renders no frames. The ticker stops in a hidden tab and
follows the starfield's rules of docs-site 9.3: 30 frames a second at most, 10 after 30 s with no input, 15 on battery, and with `saveData` one frame per state change and no ambient motion. A map loads the art of its first deck, then the other decks it names. It
prefetches nothing else unless `saveData` is off and the main thread is idle.

A frame's patch changes only the sprites and DOM rows whose state changed. A change the reader caused, such as a door the reader opened, cross-fades its prop over 140 ms. A change that arrives in a telemetry frame on its own, such as a reactor trip, swaps the frame with no fade, so nothing moves unless the reader acts or an alarm pulses (design system 9). Under reduced motion every change swaps.

### 4.10 Accessibility

The canvas is `aria-hidden`. The DOM layer carries everything the canvas shows.

The deck directory is a `<nav aria-label="Deck directory">` region beside the canvas with one
list per deck the map names. Each room is a row with its name, its light as a status (the nominal status with "powered", standby with "dark" and alarm with the alarm's code), and the readings its binding exports with SI units.
A row expands to the room's doors and fixtures. Each door row says open or shut, the
pressure on each side and, under an interlock, the difference against the 5 kPa limit.
Each fixture row names the provider that sits at it when the graph is loaded. When the reader selects a row, its card opens (5.4), and the canvas draws the focus outline and moves the camera.

- Focus: the rows are buttons in document order, so Tab works. Arrow keys move between
  rows of one list as an addition. A "Skip the deck" link before the region jumps to the
  panels.
- Live regions: an alarm banner announces once, assertive (design system 7.6). Trigger
  announcements and the Academy's run results share one polite region and batch into one
  sentence per run or per command answer: "Run passed 2 of 3 objectives. Chart room
  powered." Telemetry announces nothing per tick.
- A summary line heads the region and updates with each alarm or command answer: "Main deck, 7 rooms, 1 alarm: HYPOXIA in airlock." It is no live region, so it never repeats an announcement.
- Colour: an alarm room also draws a hatched outline in `alarm`, so the canvas never rests
  on the red light alone, and the DOM row carries the glyph and the word (V4).
- Reduced motion follows design system 9.5. Camera moves cut, props swap, trigger effects
  apply at once, and the Academy's construct sequence shows its final state with the order
  as a list.
- Forced colours: under `forced-colors: active` the deck shows the vector schematic of
  4.11, whose strokes take system colours, and the DOM layer stays as it is.
- Zoom and reflow: at 320 CSS pixels the deck frame pans inside its own box (design system
  10), and the directory and the panels reflow below it.

### 4.11 Fallbacks

The vector schematic is the fallback for every case where the deck view cannot run. It is
the deck SVG that `tools/meridian-ship` projects from the geometry, with `data-room`,
`data-door` and `data-fixture` on each shape. The `Schematic` component of
`@nexusdi/meridian-ui` (site UX section 9) renders it: the app passes the SVG markup and an
id-to-state table from the deck state, and the component's generated style block styles
each shape by its data attribute.

| Case                                 | What the reader gets                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| no JavaScript, bridge console        | the server renders the panel, the deck directory and the schematic with the snapshot's states. Every command form posts through its React Router action and works. |
| no JavaScript, federation shell      | a `<noscript>` plate: "The federation bridge loads its stations as remotes in the browser, so it needs JavaScript. The bridge console runs without it."            |
| no JavaScript, Academy               | the hub and each briefing render as text with the schematic, and a plate says that missions run code in the browser and need JavaScript                            |
| no WebGL2, or the deck section fails | the schematic with live states in place of the canvas, and a quiet note: "This browser has no WebGL2, so the deck shows the schematic."                            |
| WebGL context lost                   | the schematic at once; the view retries once after 2 s and stays on the schematic after a second loss                                                              |
| backend unreachable                  | the deck dims to its emissive glow, every room row reads "no reading", and the station shows the "Bridge unreachable" banner (5.1)                                 |

The schematic shows room light as a fill step and alarms as the hatched outline, so the
fallback keeps every state the canvas shows.

## 5. MeridianOS demo apps

### 5.1 The bridge-station shell

The reader sits at a station on the Meridian's bridge. The backdrop is the painted bridge of
design system 11.1: the other stations, the crew seats, the command chair and the window
strip with the starfield behind, all `aria-hidden`. The reader's station fills the
foreground, and its screens hold the DOM plates and the deck view.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  bridge windows: starfield                                                   │
│  painted bridge: other stations, crew seats, depth                           │
│ ┌ station hood ─────────────────────────────────────────────────────────────┐ │
│ │ MeridianOS   tick 1,204   ship time 00:10:02   mission survey-7   ■ check │ │
│ ├───────────────────────────────────────────────────────────────────────────┤ │
│ │ alarm banner (only while an alarm is raised)                              │ │
│ ├──────────────────┬──────────────────────────────────┬─────────────────────┤ │
│ │ left screen      │ centre screen                    │ right screen        │ │
│ │ system panel     │ deck view                        │ card: room, door,   │ │
│ │ (module plate,   │ [Lower][Main][Upper]  │ fixture or provider │ │
│ │  gauges,         │                                  ├─────────────────────┤ │
│ │  controls,       │                                  │ terminal            │ │
│ │  last answer)    │ deck directory (beside, 4.10)    │                     │ │
│ ├──────────────────┴──────────────────────────────────┴─────────────────────┤ │
│ │ toolbar: panels  Network  zoom − +  Reduce motion  Shortcuts   │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

The station hood is the status strip of ship-systems 7.2, grown: the tick, the ship time,
the mission id of the reader's requests, and the wiring check as a status (`nominal` and
"Check passed" when the backend's graph compiled, which every running ship has). The alarm
banner sits under the hood across the station, so the master alarm shows on every panel,
which fixes the review's "master alarm only on the Safety page".

Widths:

- From 1600 CSS pixels: three screens as drawn, with the deck directory open.
- From 1280 to 1599: three screens. The deck directory folds into a drawer on the centre
  screen's left edge.
- From 960 to 1279: the left and centre screens; the right screen's card and terminal
  become tabs under the system panel.
- Below 960: one column. The backdrop crops to the window strip as a band behind the hood.
  The order is hood, banner, deck view at the ship level, deck directory, system panel,
  card, terminal.

The dark theme is the only theme (design system 4.3). The "Reduce motion" switch sets the
state of design system 9.5 for a reader whose system setting is off. The station keeps the
switch, the overlay, the deck and the zoom per viewer in `localStorage`, read and written
inside `try`, and the URL carries the deck, the zoom, the focus and the overlay (`?deck=main&focus=airlock`)
so a link opens the same view and Back undoes a camera jump. On load the URL wins, and `localStorage` fills in what a bare URL leaves out.

### 5.2 The bridge console: one station, many panels

The bridge console is one station: the reader's operations seat, whose left screen swaps
between system panels. Each panel is a contribution:

```ts
// examples/bridge-console/app/di/contracts.ts
export interface IStationPanel {
  readonly id: string; // 'engineering'
  readonly title: string; // 'Engineering'
  readonly route: string; // '/systems/engineering'
  readonly map: MapId; // 'console-engineering'
  readonly module: string; // the simulation module the panel drives
}
export const STATION_PANELS = new MultiToken<IStationPanel>('StationPanel');
```

Each system's console module (`engineering-panel.module.ts` and its siblings under
`app/di/`) binds one panel and exports `STATION_PANELS`. The toolbar's panel list renders
`all(STATION_PANELS)` in route order, so a new system adds its panel module and edits no
shell file. The diagnostics panel shows that list as the example of a multi token the
reader can see.

The console's routes keep their paths (ship-systems 7.2), and each route opens a map:

| Route                   | Map                    | Decks               | Camera                          | Shows the concept                                       |
| ----------------------- | ---------------------- | ------------------- | ------------------------------- | ------------------------------------------------------- |
| `/systems/engineering`  | `console-engineering`  | main, upper         | engineering and the reactor bay | exports and a private provider (F1), the power bus (F3) |
| `/systems/life-support` | `console-life-support` | main, upper, lower  | habitat                         | `forRootAsync` (F9), the compartment scope (F5)         |
| `/systems/safety`       | `console-safety`       | main, upper, lower  | habitat                         | alarm sinks as contributions (F3)                       |
| `/airlock`              | `console-airlock`      | main, lower         | airlock                         | the interlock interceptor (F8)                          |
| `/systems/comms`        | `console-comms`        | upper, main         | comms relay                     | `optional()` (F7)                                       |
| `/systems/helm`         | `console-helm`         | main                | bridge                          | imports between systems (F2)                            |
| `/systems/ftl`          | `console-ftl`          | lower, main         | FTL core                        | `load()` and `extend()` (F6)                            |
| `/systems/weapons`      | `console-weapons`      | upper, main         | capacitor room                  | a `lazy()` edge (F4)                                    |
| `/diagnostics`          | `console-diagnostics`  | all three, overview | computer core                   | the whole graph on the ship (F10)                       |

The home, sector, course and charts routes sit outside the ship layout and show no deck.
A route change disposes the old map's scope and opens the new one, and the deck cross-fades
on the console tier while the camera moves to the new map's focus.

### 5.3 The federation shell: the bridge

The federation shell shows the whole bridge, since each remote is a station built by its
own team (ship-systems 7.3). It opens on the bridge room of the main deck in overview,
with each station as a fixture. A station row in the deck directory, or a click on the
station, loads that remote with `lazySection` and `{ imports: [Tactical] }` (K4), and the
camera moves from the bridge to the station's screens.

A station's state follows its section:

| Section state                         | The station on the deck                   | The station's row and placard                                                            |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| not loaded                            | screens dark, seat empty                  | standby: "Not loaded. Opens as a remote."                                                |
| loading                               | screens at emissive glow                  | active: "Loading the cartography remote"                                                 |
| loaded                                | screens lit                               | nominal: "Loaded. Reads `meridian/NavCharts` through the contract. Imported: Tactical."  |
| failed (`NEXUS_REACT_SECTION_FAILED`) | screens dark, the seat's light in `alarm` | alarm: the code, the cause's code, such as `NEXUS_CONTRACT_VERSION`, and its `Fix:` line |

The drift build of cartography fails with `NEXUS_CONTRACT_VERSION`, so the reader sees a contract break as a dead station with its fix.

Four of the bridge's six stations are remotes: cartography, command, engineering and life support (ship-systems 7.3). The helm and comms stations have no remote, and their rows read standby with "No remote. The bridge console runs this station." and a link to the console's panel. Four fixtures replace `bridge.station-bank` along its footprint (Q2): `bridge.cartography`, `bridge.engineering`, `bridge.life-support` and `bridge.comms`. `bridge.helm`, `bridge.command-chair` and `bridge.forward-console` stay, so each of the six stations has a fixture to light and fail at.

The shell's own panels (diagnostics, the station list) follow 5.4. The engineering and
life-support stations show their gauges through `STATION_TELEMETRY`, and the command
station sends helm and reactor orders through `COMMAND_LINK`, so the deck behind them
lights from the same telemetry as the console's.

### 5.4 Panels beside the deck

Every panel is a `Panel` plate (design system 7.1). Its title is the system's name, and its
header carries one status and the module plate.

```
┌ Engineering ─────────────────────────────── ■ online ┐
│ Module Engineering                                   │
│ Exports  REACTOR  POWER_ROUTER  SHIELD_GRID  +2      │
│ Private  1 provider                                  │
├──────────────────────────────────────────────────────┤
│ Reactor level        0.36                            │
│ Electric output    435.6 MW                          │
│ Coolant            612.4 K                           │
│ Shields              200 MW  ■ raised                │
├──────────────────────────────────────────────────────┤
│ Throttle [ 0.36 ]  (Set throttle)                    │
│ Shields  [■ raised]                                  │
├──────────────────────────────────────────────────────┤
│ Queued for tick 1,205. Applied at tick 1,205.        │
└──────────────────────────────────────────────────────┘
```

- The module plate reads the module from the graph: its name, its exports as chips and a
  count of the providers it keeps private, with a "Show" control that lists them. A chip
  opens the provider card. Without the graph (4.11, Q1) the plate shows the module name
  from the panel's contribution and "Graph off on this bridge".
- Gauges are the readouts of ship-systems 7.2, with their units and rounding, in `readout`
  type where one figure leads and `body` rows otherwise.
- Controls are buttons and rocker switches (design system 7.4). A destructive command, such
  as Flood or opening a hatch to space, is a hazard button with a confirm step.
- The last answer sits under the controls in the panel's own band, so a refusal never
  falls below the fold. An accepted command reads "Queued for tick N" and then "Applied at
  tick M" when a frame reaches it (demo refactor, section 6). A refusal opens the "Command
  refused" dialog with the message and its `Fix:` line, and the band keeps a one-line copy.
- Forms keep the reader's last value across a reload, read from the snapshot where the
  ship holds it, such as the pump mode, so a reset select never sends the wrong door.

The right screen holds one card at a time and the terminal under it.

| Card     | Opens from                           | Shows                                                                                                                                                             |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| room     | a room on the deck or its row        | the room's readings, its light and why, its doors, its fixtures, a "Read atmosphere" action (F5)                                                                  |
| door     | a door                               | open or shut, the pressures on each side, the interlock's difference and limit, Open and Close                                                                    |
| fixture  | a fixture                            | the fixture's state and the provider at it, with a link to the provider card                                                                                      |
| provider | a fixture, a chip or an overlay node | token, interface, class or factory, lifetime glyph and word, module, exported or private, deps and dependants as links that move the camera to each one's fixture |

The terminal is the design system's `Terminal` (7.2). Its lines are the command answers,
the flight-log entries with their mission id, the alarms raised and cleared, and the
telemetry stream's own notes, such as "scope extended after load". The source column names
the module.

### 5.5 Each UX element and the concept it shows

| UX element                                 | Container concept                 | How the reader meets it                                                                                                                                                                                                                       |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a panel's module plate                     | modules and exports               | exported tokens as chips, private providers as a count; a private provider's card says an importer's provider gets `NEXUS_MISSING_PROVIDER` ("provided in Engineering, which does not export it") and a root `get()` gets `NEXUS_NOT_VISIBLE` |
| a provider at a fixture, the provider card | providers, interface-first        | the card pairs the token and interface with the class bound by `useClass`; deps walk the camera across the ship                                                                                                                               |
| the power bus in the engineering panel     | multi-token contributions         | each `POWER_CONSUMERS` contribution is a row with its module and a conduit; a shed is the simulation's priority rule (F3)                                                                                                                     |
| the toolbar's panel list                   | multi-token contributions         | the panels are `all(STATION_PANELS)`; the diagnostics panel lists the contributions and their modules                                                                                                                                         |
| the alarm banner's source line             | multi-token contributions         | "MasterAlarm told 1 sink: AuditAlarmSink in AlarmPanel"                                                                                                                                                                                       |
| scope brackets on a room                   | scopes and `REQUEST`              | a room read opens a request scope for that room, drawn as corner brackets for the request's life                                                                                                                                              |
| the request's flight log in the terminal   | scoped lifetime                   | each answer's flight log is labelled "this request's FlightLog", one per request                                                                                                                                                              |
| the FTL core powering up                   | `load()` and `scope.extend()`     | the section loads on the reader's command; the stream's note reports the extend                                                                                                                                                               |
| the dashed edge to an empty socket         | `optional()`                      | the comms array runs with no link and says so; the socket waits on issue #250                                                                                                                                                                 |
| the dashed edge that resolves at fire time | `lazy()`                          | the railgun and the shields reach the router through a lazy edge                                                                                                                                                                              |
| the interceptor chain on a refused hatch   | interceptors                      | the callout lists `FlightRecorder`, then `PressureInterlock`, which refused                                                                                                                                                                   |
| the startup chart in diagnostics           | `forRootAsync`, the profiler      | the life-support calibration is the async step the ship waits on                                                                                                                                                                              |
| a station that loads, or fails             | federation sections and contracts | a remote is a station; a contract break is a dead station with its fix                                                                                                                                                                        |
| the console graph tab                      | the runtime's own wiring          | the console's client graph shows `DeckView` loaded, `PIXI_APP` private and the bindings as contributions                                                                                                                                      |

### 5.6 Flows

Each flow runs on the seeded ship from tick 0, so the e2e suites can replay it.

F1. Modules and exports: Engineering keeps its coolant loop.

1. The reader opens Engineering. The camera opens on engineering and the reactor bay, and
   the module plate lists five exports and "Private: 1 provider".
2. The reader selects `reactor-bay.coolant-pumps`. The fixture card names the provider at
   it, `COOLANT_LOOP` bound to `RadiatorLoop`, and marks it private to Engineering.
3. The provider card says what core raises when the loop is read from outside
   Engineering: a provider in an importing module fails the check with
   `NEXUS_MISSING_PROVIDER` and the line "CoolantLoop is provided in Engineering, which
   does not export it.", and a root `get(COOLANT_LOOP)` throws `NEXUS_NOT_VISIBLE`. The card
   also says that `EngineeringPhysics` reads it inside the module.
4. With the overlay on, the edge from `EngineeringPhysics` to `COOLANT_LOOP` stays inside
   the engineering and reactor-bay hull sections. Every other edge into Engineering ends at
   an exported token.

F2. Providers and imports: the helm plots a course.

1. The reader opens Helm and selects `bridge.helm`. The provider card shows `HELM` bound to
   `HelmControl`, with deps `THRUSTERS`, `MAIN_DRIVE` and `NAV_CHARTS`.
2. The reader follows `NAV_CHARTS`. The camera moves to `chart-room.plot-table`, and the
   card shows that Helm reads it through its import of `Tactical`.
3. The reader plots a course. The terminal prints the answer and the audit line that the `NavAudit` interceptor on `NAV_CHARTS` wrote.
4. With the overlay on, the edges from `HelmControl` run to the RCS thrusters inside Helm, and to the main drive and the chart room through the imports of `Propulsion` and `Tactical` that Helm declares.

F3. Multi-token contributions: the power bus.

1. On Engineering, the power bus lists each `POWER_CONSUMERS` contribution with its
   module, priority, demand and allocation. Each row highlights its conduit on the deck.
2. Each row names the module that published the contribution and its place in the list
   `all(POWER_CONSUMERS)` returned, which follows record order (extension points 4.2). With
   the overlay on, each row's `all()` edge runs from `PlasmaRouter` to the contributor's
   fixture, and no edge runs from Engineering to a contributor's module, since the router's
   module imports none of them (K1).
3. The throttle and the load shedding stay on the panel as ship controls. The flow teaches
   neither, since the router's priority rule is ship code and core plays no part in a shed.
4. On Safety, the alarm banner's source line names the sinks `MasterAlarm` collected,
   including `AuditAlarmSink` from bridge-api's `AlarmPanel`, a module the library never
   imports.

F4. A lazy edge: the railgun fires.

1. On Weapons the overlay draws the edge from `RailgunMount` to `POWER_ROUTER` dashed, as
   `graph()` reports a `lazy` edge. The provider card says why the edge is lazy:
   `PlasmaRouter` reads `all(POWER_CONSUMERS)`, `WeaponsPower` is one of them and reads
   `WEAPON_MOUNT`, so a required edge from the mount back to the router would close the
   cycle that `NEXUS_CIRCULAR_DEPENDENCY` names. The card shows that error's text from a
   build-time fixture of the variant.
2. The startup chart in diagnostics shows `RailgunMount` built at a lower level than
   `POWER_ROUTER`, which reads it through `WeaponsPower`. Only the lazy edge allows that
   order.
3. The reader fires at 10,000 m. The capacitor banks, the conduit flow and the power-budget
   refusal are ship behaviour, so the flow marks them as the simulation. Core emits no
   trace event when the mount's thunk reads the router (issue #249), so the dashed edge
   stays unlit at fire time until core does.
4. The shields show the same edge: `DeflectorGrid`'s edge to `POWER_ROUTER` draws dashed.

F5. Scopes: a compartment's atmosphere.

1. The reader selects the habitat and presses "Read atmosphere". The console requests
   `GET /compartments/habitat/atmosphere`.
2. While the request runs, the habitat draws scope brackets in `data`, and the room card
   reads "Request scope for habitat. COMPARTMENT is habitat. GasAnalyzer is transient, so
   this read built one."
3. The reading appears in the card with its tick. A second read shows other noise and a new
   tick, which the card explains as a new analyzer.
4. An unknown id from a typed URL answers 404 with `MERIDIAN_UNKNOWN_COMPARTMENT`, shown as
   a refusal with its fix.
5. In the terminal, each command's flight-log lines carry the request's mission id, under
   the label "this request's FlightLog". The hood's mission switch changes the
   `x-mission-id` of the reader's requests, so two missions write two logs.

F6. `load()`: the FTL drive joins the running ship.

1. On FTL the FTL ring is dark. The ring is `off`, its row reads "not loaded" with the
   standby glyph, and the panel says "FtlDrive is a section. It loads when you ask for it."
2. The reader presses "Load FTL drive", which posts `POST /sections/ftl`.
3. The section loads, and the desktop plays its one orchestrated motion: the ring lights,
   the `power.ftl-spool` conduit draws from engineering, and with the overlay on the `FtlDrive`
   module and its edges join the graph, each step on the sequence tier, 2.4 s at most.
4. The terminal's telemetry line notes "stream scope extended after FtlDrive loaded", and
   the next frames carry the drive's rating.
5. The button reads "Loaded". A second press is impossible, and a reload keeps the drive
   loaded, since the backend loads it once.

F7. `optional()`: comms without a relay.

1. On a ship started without `RELAY_URL`, the comms relay's console is `off` and the
   array's status reads "no subspace link" with the offline glyph.
2. The array's card says `PhasedArray` reads `optional(SUBSPACE_LINK)` and got no link.
   The overlay cannot draw the empty socket yet, since `graph()` records no edge for an
   optional dep with no provider (issue #250); the socket joins the overlay when it does.
3. A hail queues, and the panel's answer band gives the fix line that names `RELAY_URL` and the `dev-relay` target (demo refactor, T31).
4. On a ship started with the relay, `SUBSPACE_LINK` resolves, the console turns `on` and
   the hail is answered.

F8. Interceptors: the airlock drill.

1. On Airlock the camera opens on the airlock and its two hatches. The first-visit callout
   points at the outer hatch.
2. The reader opens `airlock-outer` at 101.3 kPa. The hatch stays shut, its hazard banding
   lights, and the "Command refused" dialog shows `MERIDIAN_INTERLOCK` with its fix. The
   callout at the hatch lists the chain on `BLAST_DOORS.open`: `FlightRecorder`, then
   `PressureInterlock`, which refused, so nothing reached `BlastDoorControl`.
3. The reader sets the pump to evacuate. The duct to the habitat flows, the airlock's
   pressure readout falls, and the door row shows the difference closing on 5 kPa.
4. Under 5 kPa the door's interlock status turns `nominal`. The reader opens the hatch, the
   prop opens, the vent flows to space and the terminal prints the flight-log line.

F9. `forRootAsync`: life support's calibration.

1. On Life support the module plate reads "Configured by `LifeSupport.forRootAsync`,
   calibrated at startup".
2. The plate's "Startup" link opens diagnostics on the startup chart from `GET /profile`,
   with the calibration as the async step the ship waited on.

F10. Diagnostics: the whole graph on the ship.

1. Diagnostics opens all three decks in overview with the overlay on, and a graph view of
   docs-site 12.1 on the right screen.
2. A tab switches the overlay between the ship's graph (`GET /graph`) and the console's own
   client graph, where the reader finds `DeckView` as a loaded section, `PIXI_APP` private
   and each binding module's contribution to `DECK_BINDINGS`.
3. The panel lists `all(STATION_PANELS)` with the module of each contribution.
4. A node selected in the graph view moves the camera to its fixture, and a fixture selected on the deck selects its node.

### 5.7 Interaction map of the flows

Each flow step names the container operation behind it, the part of core that reacts and
what core returns. A step whose effect the simulation alone decides stays as a ship
control and teaches nothing about the container. The verdict column records the audit of
2026-10-29 against core, `@nexusdi/errors`, `@nexusdi/devtools`, `@nexusdi/testing` and
`@nexusdi/hono` from source at `9418d8a4`.

| Flow step                                  | Container operation                                                                                                                     | Reacts                              | Outcome core returns                                                                                                                                                        | Verdict                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| F1.2 select the coolant pumps              | read the graph: `COOLANT_LOOP` in Engineering, not in its exports                                                                       | `GET /graph`                        | the card marks the provider private                                                                                                                                         | keep                                                                               |
| F1.3 the private provider's card           | none; the card quotes what core raises for a read from outside                                                                          | a build-time fixture                | an importer's provider: `NEXUS_MISSING_PROVIDER`, "provided in Engineering, which does not export it"; a root `get()`: `NEXUS_NOT_VISIBLE`                                  | re-map: the card said `NEXUS_NOT_VISIBLE` for both                                 |
| F2.2 follow `NAV_CHARTS`                   | read the graph: Helm imports Tactical, which exports `NAV_CHARTS`                                                                       | `GET /graph`                        | the edge and the import on the card                                                                                                                                         | keep                                                                               |
| F2.3 plot a course                         | a call through the `NavAudit` interceptor on `NAV_CHARTS`                                                                               | `@nexusdi/interceptors`             | the answer and the audit line                                                                                                                                               | keep                                                                               |
| F3.1 the power bus rows                    | `all(POWER_CONSUMERS)` in `PlasmaRouter`                                                                                                | `GET /graph`                        | one row per published contribution, with its module (K1)                                                                                                                    | keep                                                                               |
| F3.2 and F3.3 throttle down, loads shed    | none; the router's priority rule decides the shed                                                                                       | the simulation                      | ship state only                                                                                                                                                             | re-map: the rows teach module and order; the shed stays a ship control             |
| F3.4 the alarm banner's sinks              | `all(ALARM_SINKS)` in `MasterAlarm`, with `AuditAlarmSink` from `AlarmPanel`                                                            | `GET /graph`                        | the sink list, from a module the library never imports (K1)                                                                                                                 | keep                                                                               |
| F4.1 the dashed railgun edge               | read the graph: `lazy(POWER_ROUTER)` in `RailgunMount`                                                                                  | `GET /graph`                        | a `lazy` edge                                                                                                                                                               | keep                                                                               |
| F4 "the edge lights at fire time"          | the mount's thunk reads the router                                                                                                      | nothing: core emits no event for it | none                                                                                                                                                                        | cut until issue #249 merges                                                        |
| F4 capacitors charge, power-budget refusal | none                                                                                                                                    | the simulation                      | ship state and a domain refusal                                                                                                                                             | re-map: marked as the simulation                                                   |
| F5.1 and F5.2 read atmosphere              | the adapter opens a request scope; `COMPARTMENT` comes from the request; `GasAnalyzer` is transient                                     | the backend's request scope         | the brackets open with the request and close when the response ends, which is when the adapter disposes the scope                                                           | keep                                                                               |
| F5.4 an unknown compartment                | `scope.get(ATMOSPHERE_SENSOR)` runs the scoped `COMPARTMENT` factory, which throws `UnknownCompartmentError`; core rethrows it as it is | the request scope                   | the route maps the app's error to 404 with `MERIDIAN_UNKNOWN_COMPARTMENT`; no core code                                                                                     | keep, as an app error a provider raised                                            |
| F5.5 two missions write two logs           | the scoped `FlightLog`, one per request                                                                                                 | the request scope                   | each answer's log lines carry its mission id                                                                                                                                | keep                                                                               |
| F6.2 Load FTL drive                        | the backend's section load, `di.load(FtlDrive)` in each adapter entry today, then `scope.extend()` on the telemetry stream's scope      | `load()`, `scope:extend`            | FtlDrive's `construct` events and the stream's note; a section whose deps no source exports rejects with `NEXUS_BLUEPRINT_INVALID` holding `NEXUS_MISSING_PROVIDER`         | keep                                                                               |
| F6.5 a second press                        | a repeat `load()` with the same load imports                                                                                            | `load()`                            | does nothing; a repeat with other load imports rejects with `NEXUS_LOAD_IMPORT`, reason `already-loaded`                                                                    | re-map: the button may stay live and say "Already loaded"                          |
| F7 comms without a relay                   | `optional(SUBSPACE_LINK)` with no provider in the graph                                                                                 | `GET /graph`                        | `graph()` records no edge for an optional dep with no provider, so the overlay has no socket to draw (issue #250). The relay exists only on a ship started with `RELAY_URL` | re-map: the array's status line carries the lesson until #250 merges               |
| F8.2 open the outer hatch                  | a call through `FlightRecorder`, then `PressureInterlock`, on `BLAST_DOORS.open`                                                        | `@nexusdi/interceptors`             | `MERIDIAN_INTERLOCK` from the interceptor; `BlastDoorControl` never runs                                                                                                    | keep                                                                               |
| F8.3 evacuate the airlock                  | none; the pump is the simulation                                                                                                        | the simulation                      | the pressure falls                                                                                                                                                          | keep as a ship control; the hatch lights only when the interceptor passes the call |
| F9 life support's calibration              | `LifeSupport.forRootAsync`, an async options factory                                                                                    | `GET /profile`                      | the calibration as the async step of startup                                                                                                                                | keep                                                                               |
| F10 the whole graph, the console graph tab | the backend's `graph()`, and the console's own client graph                                                                             | `GET /graph`, the client container  | `DeckView` as a loaded section, `PIXI_APP` private, each `DECK_BINDINGS` contribution                                                                                       | keep                                                                               |

The camera, the deck tabs, the zoom and the Network toggle of 4.4 move the view and claim
no container operation. The station toolbar's panel list is `all(STATION_PANELS)` and the deck's bindings are
`all(DECK_BINDINGS)`, both read at startup (K1). The console's map scope opens per route
with `createScope({ request: { map } })`, and a route change disposes it, so the deck's
own wiring shows the same concepts the flows teach.

## 6. The Academy

The Academy is built after the 0.4 launch. This section is its full UX design on the shared
runtime, over the mission model of docs-site section 13, which it keeps: the missions, the
files, the layouts, carrying the ship, the sandboxed runtime, the progress schema and
nothing leaving the browser.

### 6.1 The shell and the hub

The Academy is one persistent game shell at `/academy/`. The hub, the mission board, each mission and the progress page are views of one React app, and a move between them is a same-document `<ViewTransition>` (design system 9.3). The deck frame carries the name `academy-deck` across the move, so the ship stays in place. The arrival from a docs page stays a cross-document transition, with `meridian-ship` on the hero or the schematic as design system 9.3 sets. The shell
is dark-only.

The hub is the cadet's training station on the bridge, in the same backdrop as MeridianOS
with the training station in the foreground:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  bridge windows: starfield                                                   │
│ ┌ crew placard ─────────┐ ┌ ship ──────────────────────────────────────────┐ │
│ │ [avatar portrait]     │ │ upper  ░░░░▒▒▒▒░░░░░░░░░░░░░                    │ │
│ │ Cadet, second class   │ │ main   ▓▓▓▓▓▓░░░░▒▒▒▒▒▒░░░░░░░                  │ │
│ │ insignia              │ │ lower  ░░▓▓░░░░░░░░░░░░░░░░░                    │ │
│ │ 3 of 9 core missions  │ │ lit: passed   glow: next   dark: not yet       │ │
│ │ badges                │ └────────────────────────────────────────────────┘ │
│ └───────────────────────┘ ┌ mission board ─────────────────────────────────┐ │
│                           │ Core set   Decorators   Testing   Errors   ...  │ │
│                           │ ■ First light   ■ Chart room   ○ Drone bay ... │ │
│                           │ (Continue: Drone bay)                          │ │
│                           └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

The ship screen is the hub map, `academy-hub`, all three decks in overview. The ship starts
cold: emissive glow alone, no lamp light. Each mission sits at the hull section that ship-systems 16.3 names for it, or, for a mission 16.3 gives no hull section, at the rooms its providers' fixture notes name. Each passed mission lights its rooms for good. Every entry below is a compartment, a door or a conduit of the geometry, so the hub draws nothing the geometry lacks:

| Mission                | Hull section on the hub                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `01-first-light`       | the reactor bay and the computer core, where `REACTOR` and `COMPUTER` sit |
| `02-chart-room`        | chart room                                                                |
| `03-drone-bay`         | drone bay                                                                 |
| `04-decks`             | the sixteen doors, which turn from shut to open as the decks connect      |
| `05-open-channel`      | comms relay                                                               |
| `06-shuttle-launch`    | shuttle bay                                                               |
| `07-scram-drill`       | engineering, the hull section 16.3 names, with the reactor vessel's prop  |
| `08-power-loop`        | the shields' power conduits from engineering                              |
| `09-diagnostics-sweep` | computer core's racks                                                     |

The hub derives the lit state from the progress stores when it renders, through
`ProgressDeckSource` (4.8) and the map's `passed` triggers (4.6), so it stores no field
(docs-site 13.6). The next recommended mission glows at its hull section, and the
board's primary button continues it. Every mission stays unlocked: a click on any hull
section or board row opens its mission.

Package sets (2026-10-11) appear as tabs on the board. A set's missions sit at the hull
sections their concepts belong to, so an interceptors mission sits at the airlock and a
federation mission on the bridge stations. Each passed set mission lights its hull section
for good, as a core mission does. Each set has a badge.

### 6.2 The cadet avatar

The reader is an unnamed cadet with a visible avatar. The avatar is a painted portrait in
the hero's style, and it appears in two places:

- The crew placard on the hub and in each mission's strip: the portrait, the rank in words
  and its geometric insignia, the core-set progress as a `data` readout, and the badges as
  engraved plates in `hull-paint` and `hull-shadow`.
- A crew pin on the deck map during a mission: a round holo marker with the portrait, set
  at the mission's room. The pin is UI on layer 7. It is no ship art, since the runtime art
  draws only what the geometry lists (design system 8.3). A walking sprite would need an amendment to design system 8.3 and goes to the owner as its own item if anyone proposes one.

Cosmetic unlocks change the avatar alone: the portrait's frame and background, the insignia's mount and the suit patch. Each unlock uses the neutral steel roles and the art colours, never a
meaning hue, so a cosmetic never reads as a meaning colour.

The ranks are six: Cadet, third class at the start; Cadet, second class after three core
missions; Cadet, first class after six; Ensign after nine; Lieutenant, junior grade after
two finished package sets; Lieutenant after five finished sets. A set rank also needs
Ensign. Each package set declares in its manifest the pass count that finishes it, and that
figure never rises. A pass of any version of a mission counts. A new mission or a version
bump never lowers a rank. It never takes back a badge or darkens a hull section either, and a guard test
asserts this on a progress-event fixture. Each finished set gives its badge and one
cosmetic unlock: a portrait frame, a portrait background, an insignia mount or a suit
patch.

The first visit offers four painted portraits that differ in face and skin tone. The first
is preselected, so Start needs no choice. The reader can change the portrait on the
progress page, and the Academy asks for no name.

### 6.3 Mission structure

A mission is the docs-site mission (13.2) plus a map. `mission.ts` gains one field,
`map`, the id of an `academy` map in `deck/maps/`. The map's `start` stages the broken
ship the seed leaves, and its triggers react to the run. Its `goal` is the ship a passing
solution leaves.

A mission runs in five phases, each one a state of the mission view:

1. Briefing: the strip opens with the goal, and the camera moves from the hub's hull
   section to the mission's room, which shows its broken start: the chart room dark for
   `02-chart-room`, two drone racks with one drone for `03-drone-bay`.
2. Start: on a mission the reader passed before, the choice of docs-site 13.4 ("Continue
   with your ship" or "Start from the reference ship") and the diff of each `replaces` file.
3. Work: the editor, the console and the deck. Each Run reports to the deck (6.5).
4. Debrief: when every objective passes, the debrief plate shows the attempts, the time, the hints and the first-pass objectives,
   any badge the pass completes, and "Next mission" as the primary button.
5. Rank-up: when the pass crosses a rank threshold, the shell plays the rank-up (6.8).

### 6.4 The mission view

The mission view adds the deck to layout B of docs-site 13.3. The widget items take a
sixth area, `deck`, beside `strip`, `editor`, `console`, `overlay` and `actions`.

```
┌ briefing strip ─────────────────────────────────────────────────────────────┐
│ [pin] Chart room   Providers          ○ factory runs once  ○ during create  │
│ The chart table is dark: NavCharts never downloaded. (Collapse)             │
├────────────────────────────────────┬────────────────────────────────────────┤
│ editor                             │ deck: the chart room at the room level │
│ tactical.ts  engineering.ts  main  │                                        │
│                                    ├────────────────────────────────────────┤
│                                    │ console: graph │ trace │ errors │ log  │
├────────────────────────────────────┴────────────────────────────────────────┤
│ (Run checks)  Hint  Reset         attempts 2   time 06:12   hints 0         │
└─────────────────────────────────────────────────────────────────────────────┘
```

Layout C, the guided mode of missions 1 to 3, puts the step card over the editor and pins
a callout on the deck at the step's fixture, so each step points at the part of the ship
it changes.

From 960 to 1279 CSS pixels the deck and the console share the right column as tabs. Below
960 the view is one column with tabs for Briefing, Editor, Ship and Console. A mission runs
in full from 640 CSS pixels, in that one-column layout. Below 640 a mission opens on
Briefing and Ship with the editor read-only, and shows "Continue on a larger screen" and an
"Edit here anyway" button that loads the editor and its TypeScript worker. The reader's
code stays saved either way, and the read-only view loads no TypeScript worker.

### 6.5 The run on the deck

A Run sends the runner messages of docs-site 11.5 to `RunDeckSource`. The deck answers in
order:

1. `graph`: the overlay draws the reader's graph at the fixtures (4.7). A provider the
   check names missing draws at its requester as an empty socket labelled with the token.
2. `trace`: each `construct` event lights the fixture of its provider in the order core built them, 120 ms a step and 1.2 s at most. The replay answers the reader's Run, so it is no orchestrated motion of the shell (design system 9), and the rank-up stays the shell's one. A `dispose:instance` dims it,
   so `07-scram-drill` shows the reactor scramming after the computer.
3. `test`: each objective's result fires its triggers. A pass holds its effect, such as the
   chart table `on` and the chart room lit. A fail lights the room `alarm`, and the
   objective row shows the failure message beside its code.
4. `error`: a failed `create` shows the error view of docs-site 12.3 in the console, and
   the deck lights each requester of a missing provider `alarm`.

The run's result announces once in the polite region, as 4.10 sets. Under reduced motion
the construct order shows as a numbered list beside the deck and the fixtures light at once.

### 6.6 Objectives

The strip lists the objectives as statuses (design system 7.5): standby before the first
run, nominal on a pass, alarm on a fail with the message, and active while a run is going.
Each objective names the room or fixture it powers, and a click on the objective moves the
camera there. An objective marked `guided: true` in layout B shows its step card when the
reader selects it.

### 6.7 Hints

"Hint" shows the next hint for the first objective that has not passed. Hints show in the
order `mission.ts` lists them for that objective. A hint appears in the strip and as a
callout pinned at the objective's fixture on the deck, and it stays open until the reader
dismisses it or the objective passes. Each shown hint writes a `hintEvents` record. When an
objective has no hint left, the button reads "No more hints for this objective" and links
the concept page.

The hint counter in the action row reads the events, so a reader always sees how many
hints the mission used before a pass. The stars that a later release derives from hints
(docs-site 13.6) need no other record.

### 6.8 Completion, badges and the rank-up

A pass lights the mission's hull section on the hub. The debrief plate lists the pass's
figures and returns to the hub with the hull section lit, through the view transition.

The rank-up is the shell's one orchestrated motion (design system V6). The crew placard
grows to the centre and the insignia engraves stroke by stroke under the new rank's word, on the sequence tier, 2.4 s at most, and the polite region announces "Rank: Cadet, first
class." Under reduced motion the placard shows the new rank at once. A badge for a finished
set engraves on the placard within the same sequence.

### 6.9 The mission guard

The guard of docs-site 14.4 keeps its seven steps. Four checks join it for the map:

1. The mission's `map` exists, has `surface: "academy"`, and passes the geometry test.
2. Every trigger's `objective` names an objective of the mission, and every objective has
   at least one trigger, so each objective changes the ship.
3. The guard replays the seed's run messages through `RunDeckSource` headless and asserts
   the deck state equals the map's `start` for every id the `goal` names.
4. It replays the solution's run messages and asserts the deck state equals the `goal`.
   A scene hook runs in the same headless replay.

### 6.10 Progress and save

Progress stays in IndexedDB, `nexusdi-academy`, under the schema rule of docs-site 13.6.
Schema version 2 adds one store, `cadet`, keyed by `key: 'cadet'`, whose one record holds the reader's choices alone: `{ key, portrait, frame?, background?, insignia?, patch?, createdAt }`.

Rank, badges, unlocks and the lit hull sections derive from the event stores when the shell renders, so no figure is stored twice and
an upgrade never rewrites a record.

The shell saves the reader's work this way:

- The editor saves the reader's code to `missions.lastCode` 1 s after the last keystroke
  and on `pagehide`. A pass writes `passedCode`.
- The strip shows "Saved in this browser" after each save, and the browser-only notice of
  docs-site 13.7 on the progress page.
- Export and Reset stay on the progress page, and the export file gains the `cadet` store.
- A browser without IndexedDB runs every mission in memory with the notice of docs-site
  13.7, and the hub shows the ship cold with "Progress is not saved in this browser".

The Academy joins the one service worker per base path of site UX section 11, which
caches the shell, the runtime copies, the TypeScript worker and each map's art on first
use (2026-10-12), with network-first HTML. After one visit the Academy runs offline, and a
new deploy's hashed URLs replace the cached copies on the next online visit.

### 6.11 How the missions use the shared runtime

The Academy mounts `@nexusdi/meridian-deck` in the docs page, outside the run's sandboxed
iframe, which keeps its CSP and its opaque origin (docs-site 11.4). The page's deck graph
binds `DECK_SOURCE` to `RunDeckSource` and imports no binding module, since no telemetry
reaches a mission: the map's `start` and its triggers set every state. The harness passes
the docs ship's annotator to the `graph()` it already posts, so each provider carries its
`fixture:` note, and the harness changes no behaviour a reader can observe.

The demo apps and the Academy share the art, the layers, the camera, the DOM layer and the
fallbacks. They differ in their maps and their source, as design system 8.5 sets.

### 6.12 Academy budgets

| Budget                               | Limit                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| the hub before first interaction     | 120 kB gzipped of JavaScript, the deck view section excluded |
| the deck view section                | 260 kB gzipped, the row of 4.9, shared by every mission      |
| a mission's art beyond the hub's     | 1.2 MB transferred, cached by the service worker             |
| a mission switch with the art cached | 1 s from the click to an interactive editor                  |

The TypeScript worker and the declarations keep the docs-site row of 1.16 MB, loaded on the
first edit.

### 6.13 Interaction map of the missions

A mission's one control is Run. Run compiles and builds the reader's program in the
sandbox, and the deck reacts to the runner messages of 6.5 alone, so every light on a
mission map follows a container outcome (4.6). The table gives each mission's broken seed,
the outcome core returns for it, and the deck's answer. Rows 3 to 9 come from the probe
run of 5.7 for the same mechanism, with the docs ship's names. Rows 1 and 2 give what the
missions' tests assert in docs-site 13.

| Mission                | The seed's fault                                                         | Outcome core returns                                                                                                                                                                 | The deck's answer                                                          |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `01-first-light`       | `QuantumComputer` names `FusionReactor`, so an override cannot reach it  | the test override of `REACTOR` changes nothing the computer holds; the objective fails                                                                                               | the computer core stays dark until the objective passes                    |
| `02-chart-room`        | `NAV_CHARTS` bound with `useValue`, so no factory runs                   | no `construct:await` for `NAV_CHARTS` in the trace                                                                                                                                   | the plot table stays `off`; it lights on the factory's `construct`         |
| `03-drone-bay`         | `DRONE` is a singleton                                                   | two `get(DRONE)` calls return one instance; as a transient they return two that hold one `ShipComputer`                                                                              | one rack lights for one drone, two for two                                 |
| `04-decks`             | `Engineering` keeps `COMPUTER` private                                   | `NEXUS_MISSING_PROVIDER` for ShipComputer in Tactical, near miss `not-exported`: "ShipComputer is provided in Engineering, which does not export it."                                | the requester's room takes `alarm`; the doors open once the check passes   |
| `05-open-channel`      | the schema accepts a negative frequency                                  | with the fix, `Comms.forRoot({ frequency: -3 })` makes `create` reject with `NEXUS_PROVIDER_FAILED`, cause `NEXUS_INVALID_MODULE_OPTIONS`; `check()` passes, since it runs no schema | the comms relay takes `alarm` on the failed `create`                       |
| `06-shuttle-launch`    | `FLIGHT_LOG` is a singleton                                              | one instance across two `createScope()` calls; made scoped under a singleton, `NEXUS_LIFETIME_VIOLATION`                                                                             | the shuttle bay lights one lane per scope                                  |
| `07-scram-drill`       | the reactor disposes before the computer                                 | with the fix, `dispose:instance` runs newest first: ShipComputer, then ReactorCore                                                                                                   | each `dispose:instance` dims its fixture                                   |
| `08-power-loop`        | `SHIELD_GRID` and `POWER_ROUTER` need each other                         | `NEXUS_CIRCULAR_DEPENDENCY` with the cycle's path; with `lazy()`, the check passes; a thunk read in a constructor gives `NEXUS_NOT_READY` as the cause of `NEXUS_PROVIDER_FAILED`    | the ring draws on the overlay and opens on the fix                         |
| `09-diagnostics-sweep` | `Engineering` contributes a diagnostic and does not export `DIAGNOSTICS` | under K2 the seed no longer starts: `NEXUS_UNREAD_CONTRIBUTION` for `DIAGNOSTICS` in Engineering, "... and no provider can read it."                                                 | the computer core's racks take `alarm` until the export or a reader exists |

Docs-site 13.1 words mission 9 for K2: the seed fails at the check with
`NEXUS_UNREAD_CONTRIBUTION` for `DIAGNOSTICS` in Engineering, and the reader adds the
export. The mission guard's replay of 6.9 asserts that code.

## 7. What an implementation changes

The map format and the library:

- `deck/meridian.geometry.json` replaces `bridge.station-bank` with the four station
  fixtures of 5.3, and gains `states` and `emissive` on each of the 45 fixtures, and
  `src/geometry/ship-geometry.ts` types them. The geometry test checks every map in
  `deck/maps/` against `map.schema.json` and the geometry's ids and states.
- `src/notes.ts` adds the `fixture:` notes, and the geometry subpath exports `fixtureOf`.
- `examples/meridian` exports its annotator with the same notes for the docs ship's tokens.
- `deck/maps/` holds the nine console maps, `bridge-stations` for the federation shell,
  `academy-hub` and one map per mission.

The runtime and the apps:

- `internal/meridian-deck`: the modules of 4.1, the layers, the camera, the input, the
  bindings, the sources, the DOM layer as React components over `@nexusdi/meridian-ui`, the
  schematic fallback and `testing`. Pixi v8 is its one new dependency, pinned exact.
- The bridge console: `STATION_PANELS` and one panel module per system, the station shell,
  the route maps of 5.2 and the hooks of the demo refactor's seam.
- The federation shell: the bridge map, the station states of 5.3 and the `noscript` plate.
- `apps/docs`: the Academy shell, the `map` field of `mission.ts`, the `cadet` store and the
  guard's map checks.
- `tools/meridian-ship`: the sidecar origin of 4.3 and the deck SVG with the state hooks
  the fallback needs.
- `examples/bridge-api`: `SHIP_INTROSPECTION` (Q1), read by every entry, the Worker
  included, which gates `GET /graph` and `GET /profile`.

Tests: a unit test per binding, the store's patch rules, the trigger engine on scripted
events, the DOM layer against `FakeDeckSource` in each route test, and one Playwright case
per flow of 5.6 on the seeded ship that asserts the DOM layer and a screenshot of the deck.

## 8. Delivery

The demo apps' MeridianOS follows the growth-track rule of ship-systems 7.4: it merges when
green and never blocks a release. The suggested order:

| Step | Brings                                                                                                                                 | Needs                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| D0   | `internal/meridian-deck` with `DeckState`, and `DeckView` with the base and light layers, for the front page's lit cutaway (OR5, TL23) | none                                        |
| D1   | the geometry fields, the station fixtures, the map schema and its test, `fixture:` notes                                               | none                                        |
| D2   | `internal/meridian-deck`: deck state, bindings, DOM layer, schematic fallback                                                          | D1                                          |
| D3   | the station shell and the console panels as contributions, on the schematic                                                            | D2, the demo refactor's seam                |
| D4   | the Pixi deck view with the base and props layers, then light, conduits and overlay                                                    | D3, the painted deck bases and prop sprites |
| D5   | the flows of 5.6 with their e2e cases                                                                                                  | D4                                          |
| D6   | the federation bridge                                                                                                                  | D4                                          |
| D7   | the Academy, after the 0.4 launch                                                                                                      | D4, the playground runtime                  |

After D3 the reader has a working, accessible station before any painted art exists, so the painter never holds back the panels.

## 9. Pillars and users

- No published package changes, and core gains nothing. The demos and the Academy use only
  public API: `defineModule`, `provide`, `Token`, `MultiToken`, `all()`, `load()` with a
  load import, `REQUEST` and the devtools graph.
- A reader of the demos meets every concept the owner listed on screen, through the same
  idioms the docs teach.
- The console's first load grows by the deck state alone. Pixi and the art load after the
  panels, on the deck routes.
- 0.3 users and rc users see no change in any package. A reader who ran the demos before
  runs the same commands.

## 10. Risks

- The painted deck bases and prop sprites gate D4. D3 runs on the schematic until they
  arrive.
- The fixture notes tie the graph to the geometry. A provider that moves module keeps its
  note, and the guard of D1 fails when a note names an id the geometry lacks.
- A reader may read the scope brackets as a selection. The brackets carry the word "scope"
  in their callout and last only for the request.
- Trigger holds can hide a live state. A hold lives only while its map's scope is open, and
  every held id shows "held by this map" in its DOM row.

## 11. Out of scope

- The front page's layout and the assignment of its scenes, which the site UX spec makes
  (none at 0.4, U4).
- Sound.
- The painting of the deck bases, the props, the bridge backdrop and the avatar.
- New simulation physics. Every state the art shows comes from a record the snapshot holds
  today.

## 12. Vocabulary

The Academy needs crew words that docs-site 7.1 lacks: "cadet" for the reader and "crew placard" for its plate, plus the six rank names of 6.2, from "Cadet, third class" to "Lieutenant". The demo apps add "station" (a seat on the bridge with its
screens) and "panel" (one system's plate on a station). "Section" keeps its 7.1 meaning, a
module added with `load()`, and "hull section" stays a region of the deck.

## 13. Decisions on the open questions

The architect proposed each decision below, and the tech lead ruled on 2026-10-30 under
the owner's delegation of these PRs.

Q1. The network overlay outside development: a `SHIP_INTROSPECTION` flag.

bridge-api reads `SHIP_INTROSPECTION`, `on` or `off`. When it is on, every entry passes the
`graph` option and serves `GET /profile`, the Worker entries `worker.ts` and
`worker.offline.ts` included, which pass no `graph` option today. On the Node entries an unset flag follows `isDev(process.env)`. On
the Worker entries an unset binding means off, since a Worker has no `NODE_ENV`. The demo scripts
and every hosted demo set it on. The flag covers `GET /profile` as well, which the startup
chart in diagnostics reads (F4, F9).

Q2. One geometry fixture per bridge station: four fixtures replace `bridge.station-bank`.

`bridge.cartography`, `bridge.engineering`, `bridge.life-support` and `bridge.comms` divide
the station bank's footprint (x 4.2 to 8.0 m, y 3.6 to 4.4 m). `bridge.helm`,
`bridge.command-chair` and `bridge.forward-console` stay. The geometry goes from 42
fixtures to 45, and design system 11.1 lists the new fixtures.

Q3. The cadet on the deck: a portrait pin.

During a mission the cadet shows as a portrait pin on layer 7 (6.2). A walking sprite would
need an amendment to design system 8.3 and goes to the owner as its own item if anyone
proposes one.

Q4. The rank ladder and the unlocks: six ranks.

The ranks run from Cadet, third class to Lieutenant over core missions and finished package
sets, as 6.2 lists them, and a set rank also needs Ensign. Each package set declares in its
manifest the pass count that finishes it, and that figure never rises. A pass of any version of a mission counts. A new mission or a
version bump never lowers a rank. It never takes back a badge or darkens a hull section
either, and a guard test asserts this on a progress-event fixture. Each finished set gives its badge and one
neutral-steel cosmetic unlock.

Q5. The cadet's portrait: a choice of four.

The first visit offers four painted portraits that differ in face and skin tone. The first
is preselected, so Start needs no choice. The reader can change the portrait on the
progress page. The Academy asks for no name.

Q6. Missions on phones: full missions from 640 CSS pixels.

A mission runs in full from 640 CSS pixels, in the one-column tab layout 6.4 defines below 960. Below 640 a mission opens on Briefing and Ship with the editor read-only, and shows
"Continue on a larger screen" and an "Edit here anyway" button that loads the editor and its
worker. The reader's code stays saved either way, and the read-only view loads no
TypeScript worker.

Q7. Light in the vacuum bays: dark on demo maps.

On demo maps both bays stay dark apart from their emissive mask, and their DOM rows read
"Unpressurised, no lighting load" with the standby status (4.7). Academy maps light the
bays only from container conditions (4.6). The geometry already marks `shuttle-bay` and
`drone-bay` `pressurised: false` and needs no change.

Q8. The origin pixel in the design system: (64, 320).

Design system 8.3 now reads "the origin sits at pixel (64, 320) on a 76 by 20 m frame at 32
pixels per metre". `ship_svg.py` writes the deck viewBox (−2, −10, 76, 20), which puts the
bow at the centreline 2 m from the left edge and 10 m from the top. This PR carries the edit
to `specs/2026-10-29-meridian-design-system.md`.

Q9. The hub as a cold ship: adopted.

The tech lead made this call under the owner's delegation of these PRs. The Academy hub
starts cold, and each passed mission lights its hull section for good, package sets
included (M8). Section 4.6 gains `{ "passed": "<mission id>" }`, valid on `academy-hub`
alone and counted as a container condition, since a pass comes from a real run.
`ProgressDeckSource` emits one `passed` event per mission with a pass of any version in the
stores, and 4.8 lists it as a fifth source.

Q10. The front page's pre-flight bay is lit by Pixi (OR5, TL22 to TL27).

The owner asked for paint-overs exported without baked lighting, with Pixi adding the light
so it can follow state. The bay draws the unlit cutaway (a de-lit `cutaway-cut-a-s211-h375`,
bake `cutaway-unlit-v1`) and `DeckView` lights it. `internal/meridian-deck` is step D0,
with the `.` entry free of Pixi and `./view` holding the renderer, the base and light layers.
`DECK_SOURCE` is a plain token bound in the app's global module, and `DeckState.forRoot()` is
declared once (TL23). The view loads after the bay is visible and idle, and not under
`saveData`, `prefers-reduced-data`, without WebGL2 or in forced colours; the vector schematic
stays the fallback (TL24, TL25).
