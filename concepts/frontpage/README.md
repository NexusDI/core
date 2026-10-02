# Front page concepts

Three self-contained mockups of the NexusDI docs front page, built around the Starship Meridian. Each file is one static HTML page with inline SVG, CSS and JS. A hand-written simulation stands in for `@nexusdi/core`; the real library arrives in the build step. Research behind them: `specs/2026-10-02-frontpage-research.md`.

## Concept A: pixel-art Meridian (`concept-a.html`)

The ship is a pixel-art schematic with a hand-made pixel font and a retro palette.
Power-up runs like an 8-bit boot, lighting chips deck by deck in dependency order with a caption naming each section.
Unplugging a pipe sounds a blinking klaxon, opens a red alert dialog naming the missing system, and blocks launch.

## Concept B: cel-shaded Meridian (`concept-b.html`)

The ship is a cartoon cutaway with ink outlines, flat two-tone shading and comic panels.
Power-up washes each room with light and motion lines in dependency order, and the hull turns nose-up on a phone.
Unplugging a conduit fires an ALERT burst and a speech bubble naming the missing system, while the launch button shows hazard stripes.

## Concept C: pre-flight console (`concept-c.html`)

The page is the ship's pre-flight console: a blueprint schematic with hand-lettered notes that map sections, hatches and conduits to modules, exports and dependencies.
A breaker bank and couplings on the hull control the conduits, and the decks light in dependency order.
The launch key stays locked while the checklist shows the failing line that names the missing system.

## Recommendation

Build on concept B. It is the most fun and the most visual, it reads as a sales page at a glance, and the red alert lands hardest on a phone. It also borrows C's labels that point at a section, a hatch and a conduit, C's per-section pass and fail list, and A's caption that names each deck as it powers up.

On a phone, B's arrow labels sit tight against the conduits and need a spacing pass in the build.

Before publishing, confirm the comparison rows against the NestJS and InversifyJS versions you check, and date the table.
