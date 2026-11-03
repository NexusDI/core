# @nexusdi/meridian-deck

The deck runtime of the Meridian docs. A private package, in three entries.

- `@nexusdi/meridian-deck` holds the deck state: `DeckState` (a configurable
  module), the tokens `DECK_OPTIONS`, `DECK_SOURCE`, `DECK_STATE` and
  `DECK_BINDINGS`, and the contracts a source implements. It imports no Pixi.
- `@nexusdi/meridian-deck/view` holds `DeckView`, which exports `DECK_VIEW`
  alone. `DECK_VIEW.attach(canvas)` lights the unlit cutaway with PixiJS and
  resolves on the first presented frame.

The app binds `DECK_SOURCE` in its own global module, declares
`DeckState.forRoot(...)` once and loads the view over it:

```ts
await nexus.load(DeckView, { imports: [BayDeckState] });
await nexus.get(DECK_VIEW).attach(canvas);
```

- `@nexusdi/meridian-deck/testing` holds `FakeDeckSource`, a source a test
  pushes events through. It imports only the main entry.

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
