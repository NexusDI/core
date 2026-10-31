# @nexusdi/meridian-deck

The deck runtime of the Meridian docs. A private package, in two entries.

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

Design: `specs/2026-10-29-meridian-map-runtime-ux.md` section 4.1 and
`specs/2026-10-29-meridian-design-system.md` section 8.2.
