# Meridian design system

Status: approved, 2026-10-29. The owner set the look and the surfaces it covers on
2026-10-24 and 2026-10-29, and ruled on the eight points this spec raised on 2026-10-29
(section 2.1). This spec turns those decisions into tokens and components.

Packages: no published package changes. `internal/meridian-ui` (`@nexusdi/meridian-ui`,
private) changes its tokens and its components. `apps/docs` changes its
theme files. The demo apps under `examples/` adopt the package in their own UX specs.

Depends on:

- `specs/2026-09-23-docs-site-design.md`: section 2 (decisions 9,
  10 and 24), section 8 (the tokens), section 9 (the background module) and section 10.5
  (view transitions). Section 3 of this spec lists what it replaces there.
- `specs/2026-10-21-meridian-ship-systems-design.md` on `release/0.4`: section 16 (the ship
  layout, the network overlay and the exterior brief) and section 15 (the owner rows of
  2026-10-24 and 2026-10-28).
- `examples/meridian-systems/deck/meridian.geometry.json`, the one master plan of the ship,
  and `tools/meridian-ship/`, which projects it to SVG and builds the concept mesh and its
  renders.
- The code on `origin/release/0.4` at `fa6e08da`: `internal/meridian-ui/src` and
  `apps/docs/app`. Every claim about the current tokens below was read there.

## 1. Problem

Five surfaces show the Starship Meridian: the MeridianOS demo apps, the docs front page,
the feature pages, the docs chrome and the Academy. Today they look like four different
products. The docs chrome uses direction D of the docs-site spec: a navy nebula behind
glass panels, with cyan and magenta signals. The front-page mockups use concept E's
cel-shaded cutaway. The bridge console uses Tailwind's default white and gray. The
concept mesh in `tools/meridian-ship/` renders a grounded industrial hull that none of
them matches.

The owner wants one identity across all five, in the grounded look of the concept boards,
and a reader who moves from the front page into the demo app should stay on the same
ship. Two constraints shape the system:

1. Every surface is 2D on a website. The ship art has to read at thumbnail size, and a
   docs page has to stay a calm reading surface.
2. Colour carries meaning. A reader who learns that cyan is data on the front page reads
   the same cyan as data in the deck view and in a console log.

## 2. Decisions

### 2.1 The owner's decisions

| Date       | Decision                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | The docs teach concepts with interactive widgets in the style of samwho.dev that run the real `@nexusdi/core`, each one only where interaction makes the concept clearer.                                                 |
| 2026-10-12 | View Transitions apply across the whole site. Rich surfaces may use service workers, Cache Storage, preloading and wasm where they help.                                                                                  |
| 2026-10-24 | The look is grounded industrial sci-fi in the spirit of Star Citizen's ships: a believable engineered hull, warm interior light and cyan holographic data. The design is original: no names, logos or UI layouts from it. |
| 2026-10-24 | Colour carries meaning: cyan for data, amber for actions and warnings, red for alarms.                                                                                                                                    |
| 2026-10-24 | Terminal and log panels borrow the layout of the Alien-concept terminal board, without the CRT dread. Trek-clean pastel and grunge are rejected.                                                                          |
| 2026-10-25 | The OS desktop is a bridge station on a larger bridge, with other stations, crew seats and depth around it, and the bridge windows and space behind it.                                                                   |
| 2026-10-28 | The output is 2D on a website and stays simple.                                                                                                                                                                           |
| 2026-10-29 | The look carries over to all UX and supersedes front-page concept E's cel style. Concept E's interactions stay: cut a conduit, the power-up sequence and the three fault scenarios.                                       |
| 2026-10-29 | One identity serves the demo apps, the front page, the feature pages, the docs chrome and the Academy game shell with the cadet avatar.                                                                                   |
| 2026-10-29 | The grounded look replaces direction D in the docs chrome: the nebula, the glass panels, the magenta signal and the gradient ground go. This reverses docs-site decisions 9 and 10 (section 3).                           |
| 2026-10-29 | Green (`nominal`) is a fourth meaning hue, for a check that passed and a system that is online, and appears nowhere else (section 4.2).                                                                                   |
| 2026-10-29 | Links, the Nextra primary and the focus ring take `action` amber (sections 4.1 and 4.2).                                                                                                                                  |
| 2026-10-29 | The lifetime hues and the per-kind hues of the API reference go: a lifetime shows as a glyph in `data` cyan with its word, and an export kind as a neutral chip with its word (section 4.6).                              |
| 2026-10-29 | The hull carries no livery accent hue. The `MERIDIAN` and `SV-01` stencils in `hull-shadow` mark the ship (section 4.5).                                                                                                  |
| 2026-10-29 | Space Grotesk stays the display face (section 5.1).                                                                                                                                                                       |
| 2026-10-29 | The demo apps and the Academy run in the dark theme alone. The docs, the front page and the feature pages follow the reader's setting (section 4.3).                                                                      |
| 2026-10-29 | A map extends `meridian.geometry.json`: fixtures gain `states` and `emissive`, and map files refer to the geometry by id (section 8.5).                                                                                   |

Ship-systems section 15 records the 2026-10-24 look row. The other rows come from the owner's messages, and this spec records them in the repo for the
first time. The owner made the eight rows from "The grounded look replaces" on after
reviewing this spec.

### 2.2 Decisions of this spec

| #   | Decision                                                                                                                                                                                                                                     | Section |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| V1  | Screens and windows stay dark in both themes. The bulkhead (page chrome) follows the reader's theme. A surface that shows space, the ship, a terminal or an explorable is a screen. The demo apps and the Academy are dark in both settings. | 4.3     |
| V2  | Four meaning hues: data cyan, action amber, alarm red and nominal green. Every other colour on a surface is neutral steel.                                                                                                                   | 4.2     |
| V3  | Surfaces are opaque painted plates with a chamfered corner. This spec removes the glass panels and the backdrop blur.                                                                                                                        | 6.3     |
| V4  | A state never rests on colour alone. Each status pairs its hue with a glyph and a word.                                                                                                                                                      | 7.5     |
| V5  | The deck map is a 2D game in PixiJS with unlit runtime art (a deck base, prop sprites per state, masks from the geometry) and dynamic light. Lit paintings are marketing art alone. The schematic and the icon are vector.                   | 8       |
| V6  | One orchestrated motion per surface, such as the power-up on the front page and the rank-up in the Academy. Everything else moves only in answer to the reader.                                                                              | 9       |

## 3. What changes from direction D

The docs-site spec's decision 9 set direction D, "Deep space HUD", and decision 10 the
animated nebula. The owner's decision of 2026-10-29 carries the grounded look to all UX
and replaces both. This reverses docs-site decisions 9 and 10, and this spec overrides the
docs-site spec's sections 8 and 9 where the two disagree.

| Today (direction D)                                           | This spec                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| navy ground `#070a1c` to `#1a2150`, a gradient on `html`      | a flat steel bulkhead, `#14191f` dark and `#eceef1` light                                |
| `hull` glass at 86% with a 12px backdrop blur                 | opaque `plate` and `plate-raised`, no blur                                               |
| the WebGL nebula behind every page (phase 2)                  | no canvas behind docs pages; a starfield seen through windows on the rich surfaces (9.4) |
| `signal-cyan` as the primary and the link colour              | `data` cyan for data alone; links and the Nextra primary take `action` amber             |
| `signal-magenta` for scoped lifetimes, interfaces, exceptions | removed                                                                                  |
| `status-pass` green, `status-fail` red                        | `nominal` green and `alarm` red                                                          |
| radii 14px panel, 8px control                                 | 2px plate with an 8px chamfer, 3px control                                               |
| uppercase micro labels tracked +0.08em                        | sentence-case placard labels in IBM Plex Sans Condensed                                  |
| focus ring in `signal-cyan`                                   | focus ring in `action` amber                                                             |

What stays: the package layout of docs-site section 8.1, the token pipeline
(`src/tokens/*.ts` to the committed `tokens.generated.css`), the contrast test, the
spacing scale, the type scale and its three existing families, the two motion tiers and
the Mermaid sentinel palette in `apps/docs/components/diagram/palette.ts`.

## 4. Colour

### 4.1 Roles

Each role holds one value per theme. The contrast columns give the worst ratio over the
surfaces a role sits on, computed with the WCAG 2.1 formula in
`internal/meridian-ui/src/tokens/contrast.ts`. Dark text roles are measured on
`plate-raised`, the lightest dark surface. Light text roles are measured on `bulkhead`,
the darkest light surface. Text needs 4.5:1, and a control border or a focus ring 3:1.

| Role             | Dark      | Light     | Use                                        | Dark ratio | Light ratio |
| ---------------- | --------- | --------- | ------------------------------------------ | ---------- | ----------- |
| `bulkhead`       | `#14191f` | `#eceef1` | the page ground                            | n/a        | n/a         |
| `plate`          | `#1c2229` | `#f8f9fa` | panels and the article                     | n/a        | n/a         |
| `plate-raised`   | `#252c34` | `#ffffff` | dialogs and menus                          | n/a        | n/a         |
| `seam`           | `#333b45` | `#d3d8de` | plate seams and hairlines, decorative only | n/a        | n/a         |
| `edge`           | `#6b7684` | `#7a8591` | control borders                            | 3.06:1     | 3.23:1      |
| `text`           | `#e8ecf0` | `#11161c` | prose and labels                           | 11.88:1    | 15.64:1     |
| `text-secondary` | `#b0b9c3` | `#3a444f` | captions, metadata                         | 7.10:1     | 8.52:1      |
| `text-tertiary`  | `#8f99a5` | `#545f6b` | placeholders, disabled labels              | 4.88:1     | 5.60:1      |
| `data`           | `#4dd6ea` | `#006e86` | readouts and the selected row              | 8.14:1     | 5.05:1      |
| `action`         | `#f0a43a` | `#985700` | links, focus, action text, warning text    | 6.77:1     | 4.89:1      |
| `action-fill`    | `#f0a43a` | `#eb9a2c` | the primary button's face                  | see 7.4    | see 7.4     |
| `on-action`      | `#1b1207` | `#1b1207` | text on `action-fill`                      | 8.87:1     | 8.09:1      |
| `alarm`          | `#ff6b5e` | `#b3261e` | alarm text and alarm borders               | 5.05:1     | 5.62:1      |
| `alarm-fill`     | `#c2362b` | `#b3261e` | the alarm banner's face                    | see 7.6    | see 7.6     |
| `on-alarm`       | `#ffffff` | `#ffffff` | text on `alarm-fill`                       | 5.45:1     | 6.54:1      |
| `nominal`        | `#6ccf8a` | `#1f7340` | a passing check, a system online           | 7.34:1     | 5.04:1      |

The screen roles do not switch with the theme (V1):

| Role          | Value     | Use                                                        |
| ------------- | --------- | ---------------------------------------------------------- |
| `space`       | `#070b12` | the void behind the bridge windows and behind the hero     |
| `screen`      | `#0b1015` | the terminal face and the deck view's floor                |
| `screen-text` | `#e8ecf0` | terminal text, 16.09:1 on `screen`                         |
| `holo`        | `#0e2a33` | the backing of a holographic callout, at 94% opacity (4.4) |

On `screen`, the dark values of `data`, `action`, `alarm`, `nominal`, `text-secondary` and
`text-tertiary` measure 11.03, 9.17, 6.84, 9.94, 9.62 and 6.61 to 1.

### 4.2 Meaning rules

Each of the four hues has one meaning on every surface. A designer who needs a colour for
anything else uses a neutral role.

- Cyan (`data`) is information the system reports: a gauge value, a telemetry figure, a
  provider in the graph, a flowing conduit, the selected row of a table. Cyan is never a
  control and never a warning.
- Amber (`action`) is something the reader can do, or something that needs attention
  soon: a button, a link, the focus ring, a warning notice, a shed load, hazard banding on
  a hatch. Amber on a control and amber on a warning share a hue, so a warning always
  carries the word "Warning" and its glyph (7.5), and a control always has a control's
  shape.
- Red (`alarm`) is a fault that stops something: an alarm, a refused command, a broken
  conduit, a failed `Nexus.check`, an error in the console. Red appears nowhere else, and
  no decoration uses it.
- Green (`nominal`) is a check that passed or a system that is online. Green appears nowhere else.

Two corollaries follow. An error class in the API reference is a kind of export, and it
takes the neutral chip (4.6). A destructive control, such as "Flood" or "Vent", is an
action: it is amber with hazard banding on its edge and a confirm step, and it turns red
only in the alarm it may raise.

### 4.3 Screens and the bulkhead

Every surface splits into two layers. The bulkhead is the page chrome: the navbar, the
sidebar, the article, the footer. On the docs, the front page and the feature pages it
follows the reader's theme. The demo apps and the Academy run in the dark theme alone,
since a bridge station is a lit room of screens. A screen is anything
that shows the ship, space, a terminal or an explorable: the hero, the schematic, the deck view, the
terminal, the explorable's stage. A screen stays dark in both themes, because the art is
painted against space and a terminal is a lit display. A light-theme reader sees dark
screens set into a pale bulkhead, as a console sits in a lit room.

A code fence follows the theme. A terminal stays dark.

### 4.4 Holographic callouts

A callout sits beside the part of the ship it describes and shows live numbers, as on
the citizen boards. Its backing is `holo` at 94% opacity with a 1px `data` hairline. At
94% over a pure white pixel, the brightest pixel the art can put behind it, the backing
composites to `#1c373f`, and on that `text` measures 10.61:1, `text-secondary` 6.34:1,
`data` 7.27:1, `action` 6.04:1 and `alarm` 4.51:1. `text-tertiary` measures 4.36:1 and
is not allowed in a callout. An alarm in a callout also raises the alarm banner (7.6), so
the callout is never the only place the alarm shows.

### 4.5 Art colours

The ship art uses colours outside the role table. None of them carries text, and none
appears in the chrome.

| Name          | Value                                                           | Where                                                       |
| ------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `hull-paint`  | `#9aa1a8`                                                       | the hull's main plates                                      |
| `hull-shadow` | `#4a5058`                                                       | recessed plates, the neck, the nacelle pylons               |
| `lamp`        | `#e8b46a`                                                       | the tint of the light sprites in powered rooms (8.2)        |
| `glow`        | `#dfe6ea`                                                       | the tint of the light sprite over a powered screen or core  |
| `glass`       | `#1a2a33`                                                       | the bridge window strip, before the starfield shows through |
| `hazard`      | `action-fill` striped with `on-action` at 45°, 8 px bands at 1x | bay doors and hatches                                       |

The blockout mesh in `build_ship.py` lights the window strip with a warm orange emission,
gives the radiator vanes a faint red-orange glow and paints the hazard parts `#e0a800`.
Those are material placeholders. The hull carries no livery accent hue, since a reader would take
an accent near amber or red for a meaning colour on the deck. The paint-over uses
`hull-paint` and `hull-shadow` alone, with `hazard` at the hatches and bay doors. The
`MERIDIAN` and `SV-01` stencils in `hull-shadow` mark the ship. The unlit cutaway's rooms
carry neutral swatches, so no room hue reads as a meaning colour.

### 4.6 Lifetimes, export kinds and syntax

Docs-site section 8.2 colours the lifetimes cyan, magenta and amber, and `kind.ts` gives
each export kind a hue. Both break the meaning rules: transient reads as a warning, and an
error class reads as an alarm. This spec changes both:

- A lifetime shows as its word plus a glyph in the `data` colour: a filled diamond for
  singleton, a half-filled diamond for scoped, an outline diamond for transient and a
  dash for none. The glyph replaces the hue as the second channel.
- An export kind shows as a neutral chip with its word, in `text-secondary` on a `seam`
  border.
- Syntax highlighting keeps the GitHub themes that `apps/docs/tools/code-classes.mjs` pins, since
  a fence is prose and readers know those colours. A later pass may tune them.
- The Mermaid palette in `apps/docs/components/diagram/palette.ts` keeps its six
  sentinels and rebinds them: `page` to `bulkhead`, `surface` to `plate`, `rule` to
  `seam`, `text` to `text`, `muted` to `text-secondary` and `hue` to `data`.

## 5. Type

### 5.1 Families

All four families carry the SIL Open Font License 1.1, which allows self-hosting and
embedding. The docs app reads them from pinned `@fontsource` packages through
`next/font/local`, as `apps/docs/app/layout.tsx` does today, and no page requests a font
from another origin.

| Family                  | Package                                     | Weights       | Role                                                         |
| ----------------------- | ------------------------------------------- | ------------- | ------------------------------------------------------------ |
| Space Grotesk           | `@fontsource-variable/space-grotesk` 5.3.0  | 300 to 700    | display: page titles and headings                            |
| IBM Plex Sans           | `@fontsource/ibm-plex-sans` 5.3.0           | 400, 500, 600 | body text and controls                                       |
| IBM Plex Sans Condensed | `@fontsource/ibm-plex-sans-condensed` 5.3.0 | 500, 600      | placards: panel titles, station names, labels, hull stencils |
| IBM Plex Mono           | `@fontsource/ibm-plex-mono` 5.3.0           | 400, 500      | terminals, code, readouts                                    |

IBM Plex Sans Condensed is new. Labels set in it read as narrow placard type, and it shares Plex's skeleton with the body
face, so the two sit together without a clash. It adds two latin woff2 files, whose size
the docs budget check measures when the change goes in (docs-site 4.6). Space Grotesk stays the display face, as docs-site section 8.3 fixed it.

The demo apps self-host the same files from the same packages through their bundlers, and
`@nexusdi/meridian-ui` names the families and holds no font files (docs-site 8.1).

### 5.2 Scale

The scale stays a major third (1.25) on a 16px root, as in
`internal/meridian-ui/src/tokens/type.ts`. Two tokens join it, `placard` and `readout`,
and `micro` moves from IBM Plex Mono, uppercase and tracked +0.08em, to Plex Condensed in
sentence case. `tracking.micro` goes, with the `text-transform: uppercase` rules on
`.meridian-notice__label` and `.meridian-console__title`.

| Token     | Size (rem) | Line height | Family         | Use                                      |
| --------- | ---------- | ----------- | -------------- | ---------------------------------------- |
| `display` | 3.052      | 1.05        | Space Grotesk  | the front-page headline                  |
| `h1`      | 2.441      | 1.1         | Space Grotesk  | page titles                              |
| `h2`      | 1.953      | 1.2         | Space Grotesk  | section headings                         |
| `h3`      | 1.563      | 1.25        | Space Grotesk  | subsections                              |
| `lead`    | 1.25       | 1.5         | IBM Plex Sans  | a page's first paragraph                 |
| `body`    | 1.0        | 1.65        | IBM Plex Sans  | prose                                    |
| `small`   | 0.875      | 1.5         | IBM Plex Sans  | captions, notices                        |
| `placard` | 0.875      | 1.3         | Plex Condensed | panel titles, station names, button text |
| `micro`   | 0.8        | 1.4         | Plex Condensed | labels and units beside a readout        |
| `code`    | 0.875      | 1.6         | IBM Plex Mono  | fences, terminals                        |
| `readout` | 1.563      | 1.1         | IBM Plex Mono  | the big figure of a gauge                |

Rules:

- Labels are sentence case. The only all-caps text is in-world stencil: the hull markings
  `MERIDIAN` and `SV-01`, compartment ids stencilled at a hatch, and the hazard legend on
  a bay door.
- Every figure that updates uses tabular numerals (`font-variant-numeric: tabular-nums`),
  so a gauge does not jitter as its value changes.
- A readout prints its SI unit in `micro` beside the figure, as the console does today
  (`K`, `kPa`, `MW`, `GJ`).
- Prose holds a 64ch measure. Terminal lines may run to 100 columns and wrap after that.

## 6. Spacing, grid and plates

### 6.1 Spacing

The eight steps of docs-site 8.4 stay, on a 4px base: 0.25, 0.5, 0.75, 1, 1.5, 2, 3 and
4 rem. A plate pads its content by step 5 (1.5 rem) on a wide screen and step 4 below
640px. Controls inside a plate sit step 3 apart.

### 6.2 Grid

Pages use a 12-column grid with step 5 gutters, a 1440px maximum width and a 16px outer
gutter on a phone. The docs keep Nextra's three columns. The front page and the feature
pages lay their screens across 12 columns and their text across the middle 8.

Ship views use a metre grid. One SVG unit is one metre, as `tools/meridian-ship/ship_svg.py`
writes it, and a view picks an integer number of CSS pixels per metre so hull lines sit
on whole pixels. The frames below are the ship's extent. The SVGs of `ship_svg.py` add 2 m
of margin on each side, so their viewBoxes are 76 by 18 (side), 76 by 24 (top) and 76 by
20 (deck). The top view's 23 m is the span across the nacelle vanes (ship-systems 16.6).

| View                 | Content (m)        | Pixels per metre            | Size at 1x           |
| -------------------- | ------------------ | --------------------------- | -------------------- |
| front-page schematic | 72 by 13, side     | 16 wide, 12 tablet, 5 phone | 1152 by 208 wide     |
| feature-page crop    | one hull section   | 24                          | 240 to 480 wide      |
| deck map             | 72 by 16, per deck | 12, zoom 6 to 48            | 864 by 192           |
| icon                 | 72 by 23, top      | fitted to 16 to 48 px       | 16, 24, 32 and 48 px |

### 6.3 Plates

A plate is the base surface. It is opaque `plate` with a 1px `seam` border, a 2px radius
and one 8px chamfer cut at 45° across the top-left corner. Its elevation is a 1px inner
highlight along the top edge (white at 4% dark, at 60% light) and a drop shadow of
`0 8px 20px -12px` at 60% black in dark mode and 18% in light mode. `plate-raised` adds a
second, tighter shadow for dialogs and menus.

The chamfer is a `clip-path` on the plate's inner element. A `clip-path` clips the
element's own `box-shadow` and outline, so the plate is two elements: an outer wrapper
with `filter: drop-shadow()` that follows the clipped shape, and the clipped inner face,
which draws its seam with an inset pseudo-element on the same path. A focusable element
never carries the chamfer.

Plates carry fasteners and seams only where a frame needs them. A panel in the docs
chrome is a plain plate. A station panel in the demo desktop adds two corner fastener
marks in `seam`, the `Marker` corner shape of today's package.

## 7. Components

Each component lives in `@nexusdi/meridian-ui` as a stateless React component and a class
in `styles.css`, and reads only `--meridian-*` properties (docs-site 8.1). Stateful
behaviour, such as tab tracking or a run, stays in the app.

### 7.1 Panel

`Panel` keeps its name and today's props (`as`, `raised`, `className`, `children`) and
adds `title` and `actions`. It renders the plate of 6.3, and `raised` switches to
`plate-raised`. The `title` renders as a placard in a 32px header band
above a `seam` rule, and `actions` sit at the header's end.

### 7.2 Terminal

The terminal is a screen for logs, console output and command answers. Its layout follows
the Alien-concept terminal: a header band, a fixed gutter, a body and a prompt line, with
each line's metadata in its own column.

```
┌──────────────────────────────────────────────────────────────┐
│ bridge-api / telemetry                       ● online  t 1200 │
├──────────────────────────────────────────────────────────────┤
│ t 0042 │ helm      │ course plotted to Kepler-442b     │ ok    │
│ t 0043 │ power     │ shields shed, 0.0 MW              │ shed  │
│ t 0044 │ safety    │ HYPOXIA in airlock                │ alarm │
├──────────────────────────────────────────────────────────────┤
│ > _                                                          │
└──────────────────────────────────────────────────────────────┘
```

- The face is `screen` in both themes, with `screen-text` in `code` type.
- The gutter holds the tick or time in `text-tertiary`. The source column holds the
  module or system in `text-secondary`. The status column is right-aligned and carries
  the word and the hue of 4.2.
- Values inside a message take `data`. A refused command prints its message and then its
  `Fix:` line, as the bridge console's `LastAnswer` does today.
- No scanlines, no curvature, no vignette, no flicker and no text glow. The CRT is the
  layout and the type alone.
- The body is a `role="log"` region. New lines append at the bottom and the view sticks
  to the end until the reader scrolls up.

`Terminal` composes `ConsoleFrame`: `ConsoleFrame` stays the header-and-body frame with
its title, tabs and actions slots, and `Terminal` adds the screen face, the line columns
and the prompt. The docs console renders `Terminal`, and its title renders as a placard.

### 7.3 Callout

A callout is the docs notice (`Notice`, four kinds) and the holographic data label of 4.4.

| Kind        | Edge                  | Glyph            | Label     |
| ----------- | --------------------- | ---------------- | --------- |
| `note`      | `edge`, 2px           | a circled "i"    | Note      |
| `warning`   | `action`, 2px         | a triangle       | Warning   |
| `exception` | `text-secondary`, 2px | a crossed square | Exception |
| `ship`      | `edge`, 2px           | the ship icon    | Ship note |

The label is a placard in sentence case. The holographic label (`HoloLabel`) is a separate
component: a `holo` backing, a 1px `data` hairline, a leader line to the part it names and
at most four readouts.

### 7.4 Button

| Variant     | Face           | Text        | Border                         | Use                                        |
| ----------- | -------------- | ----------- | ------------------------------ | ------------------------------------------ |
| `primary`   | `action-fill`  | `on-action` | none dark; 1px `action` light  | the one main action of a view: Run, Launch |
| `secondary` | `plate-raised` | `text`      | 1px `edge`                     | every other action                         |
| `hazard`    | `plate-raised` | `action`    | 1px `action`, banded left edge | destructive actions, with a confirm        |
| `quiet`     | none           | `action`    | none                           | toolbar actions, links styled as buttons   |

The light primary needs its border: `action-fill` on the light `plate` measures 2.17:1,
and the `action` border gives the boundary 5.39:1. Buttons are 40px tall, 32px in the
deck's dense toolbars, and never smaller than a 24px target (WCAG 2.2, 2.5.8). Labels are
placards and name the result: "Plot course", "Spool drive", "Acknowledge". A disabled
button keeps its shape, drops to `text-tertiary` and states why beside it, such as
"Launch is locked until the check passes".

Toggles render as physical switches: a 2-position rocker with the state word beside it.
`Switch` (7.7) renders it.

### 7.5 Status

A status is a glyph, a word and a hue, always all three.

| State   | Glyph          | Hue              | Example word                       |
| ------- | -------------- | ---------------- | ---------------------------------- |
| nominal | filled square  | `nominal`        | charged, a passing check           |
| active  | filled circle  | `data`           | spooling, charging, awaiting reply |
| standby | outline circle | `text-secondary` | idle, standby                      |
| warning | triangle       | `action`         | held, no power                     |
| alarm   | filled diamond | `alarm`          | an alarm, a refused command        |
| offline | crossed circle | `text-tertiary`  | offline, no subspace link          |

The words come from the system's own vocabulary: the `status` fields of the snapshot, such
as the FTL drive's and the comms array's. The app passes the component a table from each
word to a state, and a word the table lacks shows as standby. The component maps a state
to its glyph and hue, so a
new system adds its words without a change in the package (extension principle P2).

### 7.6 Alert

Alerts come in two sizes. The banner sits across the top of a screen or the page: an
`alarm-fill` face with `on-alarm` text, a 1px `alarm` border (the fill measures 2.94:1 on
the dark plate, the border 5.74:1), the alarm glyph, the code and the subject, such as
`HYPOXIA in airlock` (the safety page's `<code> in <subject>`), and an "Acknowledge" button. The dialog is a modal
`plate-raised` for a refused command: the title "Command refused", the message, the `Fix:`
line and one primary button. A warning uses the same banner in `plate-raised` with an
`action` border and the triangle.

The page announces an alarm banner once, when it appears, in an `aria-live="assertive"`
region. A warning uses `polite`.

### 7.7 Schematic, HullCrop, Switch and StepList

The site UX spec (`specs/2026-10-29-site-ux.md` section 9) adds four stateless components
to the package:

- `Schematic` renders the vector cutaway from the SVG markup it takes as a prop, with a
  generated `<style>` block that sets each room's, door's and fixture's state by its
  `data-room`, `data-door` or `data-fixture` attribute. It takes one `onClick` prop, which
  the app handles by delegation. The package imports no geometry and no
  `@nexusdi/meridian-systems`.
  An optional `children` slot renders in an overlay `<svg>` on the cutaway's `viewBox`, so
  the app can draw conduits, glyphs and focusable hotspots over the ship. The markup layer
  is `aria-hidden` and the overlay is not. `Schematic` takes three state tables (`rooms`,
  `fixtures` and `doors`) and the optional `viewBox`, `label` and `scope` props. `label` is
  required with `children`. An optional `layer` slot renders between the base picture and the
  markup in an `aria-hidden` box that takes no pointer events, for the lit canvas, and the
  `lit` flag adds a `--lit` class once the canvas presents (TL25). An optional `base` (a `src`, its width and height, AVIF and
  WebP sources, `sizes` and `loading`) makes the package render a `<picture alt="">` with
  explicit dimensions under the markup, the style and the overlay in one box, and add a
  `--painted` class (TL13).
- `HullCrop` renders a crop of the cutaway around one hull section and sets its
  `view-transition-name` from a prop. The docs app wraps it in React's `<ViewTransition>`
  (9.3).
- `Switch` renders the rocker of 7.4 as `<input type="checkbox" role="switch">` with
  `name` and `value`, and takes its state words as props.
- `StepList` renders the step list of a sequence as an `<ol>` and marks the current step
  with `aria-current="step"`.

## 8. Ship art

One master plan drives every view (ship-systems 16.6): the decks and positions in
`meridian.geometry.json`. The PixiJS deck view is a 2D game, and each demo app and each
Academy mission is a map in it. The art splits in two: runtime art, which the game lights
at run time, and marketing art, which is painted and lit once.

### 8.1 Views and their sources

| View        | Where                                                                          | Source                                                                                                                                                                                  | Format                            |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| hero        | front page top, feature pages, Academy hub, demo splash                        | marketing art: a lit paint-over of the `sv01-hero` three-quarter render of `build_ship.py`                                                                                              | AVIF and WebP, 1x and 2x          |
| cutaway     | front-page bay                                                                 | runtime art: the unlit cutaway (`cutaway-unlit-v1`, the `cutaway-cut-a-s211-h375` pass with its light removed), lit at run time by the deck view (8.2), orthographic at 25.6 px/m (8.3) | AVIF and WebP, 1024 to 2048 wide  |
| cutaway lit | ship systems strip crops                                                       | marketing art: the painted `cutaway-cut-a-s211-h375` pass, lit once                                                                                                                     | AVIF and WebP, 1024 to 2048 wide  |
| side        | ship systems strip backdrop, feature pages                                     | marketing art: the painted `side-ext-d-s211-h25-d-clip` pass, the same camera                                                                                                           | AVIF and WebP, 1024 to 2048 wide  |
| schematic   | front-page state layer, feature-page crops, docs concept pages                 | vector: `ship_svg.py`'s side cutaway, with `data-room`, `data-door`, `data-fixture`                                                                                                     | inline SVG                        |
| deck map    | the MeridianOS deck view, Academy missions, front-page scenes after 0.4 (11.2) | runtime art: the layers of 8.2, placed by `SHIP_GEOMETRY` from `@nexusdi/meridian-systems/geometry`                                                                                     | PixiJS v8 canvas plus a DOM layer |
| icon        | favicon, navbar mark, Ship-note glyph, Academy badges                          | vector: the top silhouette, hand-snapped to the pixel grid at each size                                                                                                                 | SVG, and PNG for the favicon      |

The lit painted exteriors are marketing art for the front page and the feature pages
alone. Until the paint-over is done, the hero uses the mesh render as it is. The schematic
and the icon stay vector, so they theme, scale and print with no raster. The front page
bay draws the schematic as the state layer over the unlit `cutaway`, and the ship systems
strip draws it over the lit one (OR4, OR5, TL13). The schematic's hit geometry stays the
vector's.

### 8.2 Runtime layers

The deck map draws four layers, bottom to top, and bakes no light into any of them.

1. The deck base: one unlit painted image per deck with the floors, the walls and the
   static structure alone. Doors, consoles, screens and anything else with a state are
   props, so the base never needs repainting when a state changes.
2. Props: one unlit sprite per fixture and door, with a transparent background and one
   frame per state the simulation knows for it: `on`, `off`, `damaged`, `open`,
   `closed`. A prop with no state has one frame.
3. Masks, generated from the geometry by `tools/meridian-ship`: a room-id mask (each
   compartment in its own index value), an emissive mask (screens, and the lamp housings of the geometry's `lights` list) and an interactive mask (the hit areas of doors and fixtures). The
   masks are data and never draw on screen.
4. Light, drawn by Pixi at run time (on the front page the canvas sits in the `Schematic`'s
   `layer` slot, and the painted tints of 8.4 give way to it once it presents): light sprites (soft radial textures tinted `lamp` for room light, `glow` over a screen or core, or
   `alarm` for an alarm) render into a light texture, the room-id mask clips each light to
   its room so no light crosses a wall, and the light texture multiplies over the base
   and the props. The emissive mask adds a fixed glow where a powered screen or lamp sits.
   The deck has no normal maps for now.

The light model starts from these values (OR5 mock): a powered room keeps an ambient of
0.35 and an unpowered one 0.15; a light sprite shows at 72% and reaches 1.5 times the
radius of its light in the geometry; an alarmed room drops to the unpowered ambient and
30% of its lamps, with the alarm sprite on top, so the red does not wash out to white. The
light texture stays 8-bit, since a float texture is 8-bit under software GL and the pools
would clip. A housing wider than 5 m (a long strip) glows at 45% in the emissive mask. The
glow-kind lights stand for the screens: every emissive housing in the geometry is a lamp
housing, so an unpowered room's lamp housings go dark with their lamps.

The simulation drives the light. A room with power shows its `lamp` pools, a room without
power goes dark but for its emissive screens, and an alarm adds a pulsing
`alarm` light in its room (9.2). Lamp light shows whether a room has power, as colour
shows state in the chrome. The conduits and the network overlay draw as vector on top of
the light (8.4), so data stays crisp at every zoom.

### 8.3 Asset rules

- Scale: every runtime asset uses one scale, 32 pixels per metre. The painter works at
  64 pixels per metre, and the export halves it. A deck map displays from 6 to 48 pixels
  per metre and samples the same textures at every zoom.
- Origin: every deck shares one origin, the bow at the centreline, on the geometry's
  axes (x aft of the bow, y to starboard). Each deck image carries a 2 m margin on every
  side, as `ship_svg.py` draws it with the deck viewBox (−2, −10, 76, 20), so the origin
  sits at pixel (64, 320) on a 76 by 20 m frame at 32 pixels per metre, the same on every
  deck.
- Sidecar: every image, painted or generated, has a JSON sidecar beside it that
  names its view (`deck-<id>`, `side`, `top`, `cutaway`), its pixels per metre and the pixel of the
  origin. The game places an image by its sidecar alone. The paint-over's output aligns
  through the sidecar with no change to any view.
- Marketing scale: the painted `cutaway` and `side` views and the unlit cutaway use 25.6
  pixels per metre on the frame `-5 0 80 20` (2048 by 512, origin at pixel (128, 448)), with
  `u = (x + 5) * 25.6` and `v = (17.5 - z) * 25.6`. The unlit cutaway's masks use the same
  scale and frame: the room index mask and the emissive mask are 2048 by 512, 8-bit grey, and
  the lights are in pixels of that frame (`ship_svg.py --cutaway-layers`). Their sidecars hold a sha256 of the geometry's hull,
  compartments, doors and conduits, and a test fails when it differs (TL18).
- Props: a prop sprite is a transparent WebP per state, cut to the fixture's footprint
  in the geometry plus a 0.5 m margin for overhang, and anchored at the footprint's
  centre. A sprite is named `<fixture id>@<state>`, such as `bridge.forward-console@on`.
- Atlases: props pack into texture atlases in the spritesheet JSON that Pixi's `Assets`
  loads, one atlas per deck plus one for props that several decks share. No texture or
  atlas page exceeds 2048 by 2048, the size every WebGL2 device supports, so a deck base
  (2432 by 640 at 32 pixels per metre) splits into two tiles.
- Content: the runtime art draws every room, door and fixture the geometry lists, and
  nothing else (ship-systems 16.1: the art shows no room the simulation lacks). A fixture
  that shows in two views lives in the geometry.

### 8.4 Vector layers

The schematic, the icon, and the conduits and overlay on the deck map are vector.

- Hull outlines draw in `hull-paint` at 1.5px. In the schematic, rooms fill with `screen`
  lifted 4% toward `hull-paint`, and fixtures draw as `seam` blocks. Room ids are stencil
  placards at the hatch, shown at 12 pixels per metre and above.
- A schematic room shows its power state by its fill. A powered room fills with `lamp` at
  12% over its `screen` fill, an unpowered room keeps the plain fill with its emissive
  screens lit, and an alarmed room pulses an `alarm` fill at 12% (9.2). The site UX spec
  section 4.3 sets these fills for the front page.
- Over the unlit painted cutaway a powered room is `lamp` at 18%, an unpowered room a scrim
  of `screen` at 40%, an alarm an `alarm` tint with a dashed outline of 2 screen pixels, and
  an offline fixture the scrim with the same outline; a fixture in a powered room takes no
  tint, since the base paints its housing, and a room with no state draws nothing (TL13,
  TL16, TL25). Once the Pixi canvas presents its first frame, the app sets `lit`, and the
  room tints and the offline scrim drop away. The alarm and offline outlines, the door
  hazard and the overlay stay, since they carry state a second way.
- A conduit's kind shows by its line: power a solid 2px line, coolant a double line,
  atmosphere a line of round dots. Its hue shows its state: `data` flowing, `action` shed
  or throttled, `alarm` broken. Brightness shows the figure: a power conduit's `data`
  brightness follows its allocation over its demand, and the coolant loop's follows
  `coolant.temperature` from 500 K, turning `action` within 100 K of the 1,450 K trip and
  `alarm` at it. A door that `DECOMPRESSION` closes shows shut in `alarm`. This amends
  ship-systems 16.4, whose loop colour follows the temperature on its own scale, and
  16.6, which gave the cutaway one colour per conduit kind (the cutaway render's yellow,
  cyan and green).
- The network overlay (ship-systems 16.5) draws DI edges in `data` at 1px on its own
  layer, with the edge styles 16.5 names (`optional` and `lazy` dashed 6 on 4), and a
  broken edge in `alarm` ending at an empty socket labelled with the token. While the
  overlay is on, the physical conduits dim to 40%, so a dashed DI edge never reads as a
  duct.

### 8.5 Maps

A map is one playable setup of the ship: which decks show, where the camera opens, each
prop's starting state and, for an Academy mission, the triggers that react to the
reader's code (a provider that resolves powers its room; a missing provider darkens the
room that needs it). The demo apps and the Academy missions share the map runtime and the
art, and differ only in their maps.

The map format extends `meridian.geometry.json`, which `@nexusdi/meridian-systems/geometry`
exports as the source of truth. Each fixture gains a `states` list (the frames of 8.3) and
an `emissive` flag (the emissive mask of 8.2). Each map is a JSON file in
`examples/meridian-systems/deck/maps/` that names its decks, its camera, each prop's
starting state and its triggers, every one by fixture or door id, and the geometry test
checks that every id a map names exists in the geometry. The map files hold no positions,
so the layout has one copy.

The geometry also holds a `lights` list, so the deck view knows where to draw the light
sprites of 8.2. Each light names its room and deck, its housing as a box, its kind (`lamp`
or `strip` under the ceiling, `flood` in a bay, `glow` over a screen or a core), its art
colour (`lamp`, or `glow` for a glow), the reach of its sprite in metres, an `emissive`
flag and the states `on` and `off`. The deck state derives those states, and no map sets
them: a lamp, strip or flood follows its room's light, and a glow follows the state of the
fixture it names. The deck base paints the housings. The emissive mask covers the housings
marked `emissive`, and the deck view shows a housing's glow only while its light is on, so
a dark room or bay keeps no lit lamps.

## 9. Motion

### 9.1 Tiers

| Tier        | Duration                   | Curve                            | Use                                           |
| ----------- | -------------------------- | -------------------------------- | --------------------------------------------- |
| interaction | 140ms                      | `cubic-bezier(0.2, 0.8, 0.3, 1)` | hover, focus, a disclosure, a switch          |
| console     | 200ms                      | the same                         | a view transition, a panel swap, a trace step |
| sequence    | 120ms a step, 2.4s at most | linear steps                     | the power-up, a startup trace replay          |
| ambient     | 40s to 240s periods        | linear                           | the starfield, conduit flow                   |

The first two tiers are today's `motion.ts`. The power-up lights each module in the order
`Nexus.create` resolves it, one step each, and a ship with more steps than fit in 2.4s
shortens the step. Conduit flow moves a dash pattern along the conduit at a speed that
follows the flow figure, capped at 40 px/s.

### 9.2 Alarms

An alarm pulses its banner border and the room's light at 1 Hz between full and 70%
opacity. Nothing on any surface flashes more than three times a second (WCAG 2.3.1), and
no alarm moves the layout.

### 9.3 View transitions

Same-document changes use React's `<ViewTransition>` inside `startTransition`, as
docs-site 10.5 sets. Page navigations use cross-document view transitions
(`@view-transition { navigation: auto; }`) across the whole site. Two named elements carry
across a navigation: `meridian-ship` (the hero or the schematic, so the ship stays in
place from the front page to a feature page) and `meridian-article`. A
browser without the API swaps with no animation.
Next's client router makes most navigations on the docs site same-document, so the two
names also animate through `<ViewTransition>` within the document, and the cross-document
rule covers full page loads (site UX spec section 10).

### 9.4 The starfield

The rich surfaces show space through windows: the front-page hero, the demo desktop's
bridge windows and the Academy shell. The docs-site background module
(`startBackground`) becomes a starfield with slow parallax and no nebula, drawn only
inside a window's frame, with the frame rate, idle, battery, `saveData` and hidden-tab
rules of docs-site 9.3 and its 8 kB budget. Docs pages mount no canvas.

### 9.5 Reduced motion

Under `prefers-reduced-motion: reduce`:

- every tier's duration is 0ms, and view transitions are instant;
- the power-up shows the final state at once and lists the order as text in the step
  list beside the ship;
- an alarm holds a steady border and a steady light;
- conduit flow shows a static arrow per conduit;
- the starfield renders one frame.

The demo desktop and the Academy also offer a "Reduce motion" switch that sets the same
state for a reader whose system setting is off.

## 10. Accessibility

The system targets WCAG 2.2 AA on every surface.

- Contrast: `contrast.test.ts` recomputes every ratio in 4.1 and 4.4 and fails below the
  floor. The test gains the screen roles, the holo composite and the button pairs of 7.4.
- Colour: no state rests on colour alone (V4). The status glyphs differ in shape, and the
  conduit kinds differ in line.
- Canvas: the deck view's WebGL canvas is `aria-hidden`. A DOM layer beside it lists each
  compartment with its readings, each door with its state and each alarm, and keyboard
  focus moves through that layer while the canvas highlights the focused part.
- Live regions: alarms announce once, assertive. Telemetry announces nothing per tick. A
  reader asks for a reading through the DOM layer.
- Targets are 24px at least, and 44px on a coarse pointer.
- Text reflows at 320 CSS pixels and at 200% zoom with no horizontal scroll outside a
  screen. A screen too wide for the viewport pans inside its own frame.
- In `forced-colors: active`, plates drop their shadows, the chamfer gives way to a
  square corner with a system-colour border, and status glyphs stay, since they carry
  the state.
- Fonts load with `display: swap`, and each family's fallback stack keeps the layout
  within a line of the final face.

## 11. Surfaces

### 11.1 MeridianOS demo apps

The bridge console and the federation shell render MeridianOS: a bridge-station desktop,
in the dark theme alone (4.3).
The backdrop is a painted raster of the Meridian's bridge, from the bridge's fixtures in the
geometry (`forward-console`, `helm`, `command-chair`, and the four station fixtures
`cartography`, `engineering`, `life-support` and `comms` that replace the station bank) and
`exterior.windowStrip`, with the six stations of ship-systems 16.1 and crew seats painted
over them, with the starfield of 9.4 in the windows. The reader's station sits in the
foreground, and its panels are DOM plates arranged on the station's screens. The deck
view is the map runtime of section 8, a PixiJS v8 screen loaded client-only, with the
numbers in the DOM layer of 10. Each demo app is a map on that runtime, and the Academy
missions run on the same runtime and art.
The network overlay is a toggle in the station's toolbar. Each panel carries one
system's status in its header. Both apps take `@nexusdi/meridian-ui` as a workspace
dependency, so the styling stays out of their DI code. Their UX spec places the panels.

### 11.2 Front page

The front page opens on the hero: the painted Meridian against space, the headline in
`display` and one primary button. Below it sits the schematic, the vector cutaway, with
the interactions of concept E: cut a conduit and see the broken link `Nexus.check` names,
the power-up sequence for async startup, and the three faults (a provider offline, a
closed hatch, an async provider that fails at startup). Each interaction runs the real
core and prints its result in a terminal beside the ship. The pre-flight bay lights its unlit cutaway with the deck view, which loads after the bay is
visible and idle and leaves the vector cutaway as the fallback (OR5, TL24). The other 0.4
front-page scenes run on the vector cutaway (site UX spec U4 and Q6). After the map runtime of section 8
exists, a "Walk this section" control may open one hull section on the deck map, loaded
only on that click. The vector cutaway is also the view without JavaScript. The power-up is the page's one
orchestrated motion. On a phone the schematic shows one hull section at a time with a
section picker, at 5 pixels per metre at least.

### 11.3 Feature pages

A feature page sells one capability. It opens with a schematic crop of the hull section
that capability lives in, sharing `meridian-ship` with the front page so the ship carries
across the navigation. Its explorable is a screen with controls in amber, readouts in
cyan and failures in red, running the real core. The prose sits on the bulkhead beside it.

### 11.4 Docs

The docs chrome is the bulkhead and plates of 6.3 on Nextra. The article is a plate on the
bulkhead, and the navbar shows the ship icon. Concept pages carry the console as a terminal, and an explorable as a screen inside
the article. Code fences follow the theme. Ship notes carry the ship icon. Nothing moves
on a docs page unless the reader acts, apart from a page transition.

### 11.5 Academy

The Academy shell runs in the dark theme alone (4.3) and is a station in the same visual
language: a cadet's training station
on the Meridian's bridge, with the starfield in the windows. The cadet avatar is painted
in the hero's style and appears in a crew placard with the cadet's rank, as a geometric
insignia of the system's own design. Badges are engraved plates in `hull-paint` and
`hull-shadow`, and a progress meter is a `data` readout. The rank-up is the shell's one
orchestrated motion. Each mission is a map on the runtime of section 8, with its own
starting states and triggers (8.5). The full Academy UX spec defines the layout and the progression
screens.

## 12. Implementation in the package

- `src/tokens/colour.ts` takes the roles of 4.1 and the screen roles, with the floor and
  the measured ratio beside each value. `TEXT_ROLES` lists the text roles.
- `src/tokens/contrast.test.ts` measures dark text roles on `plate-raised`, light text
  roles on `bulkhead`, the screen roles on `screen`, the holo composite of 4.4 and the
  pairs of 7.4 and 7.6.
- `src/tokens/lifetime.ts` and `src/tokens/kind.ts` map to glyphs and the neutral chip
  (4.6).
- `src/tokens/type.ts` adds the condensed family and the `placard` and `readout` tokens,
  moves `micro` to the condensed family and drops `tracking.micro`; `styles.css` drops its
  two uppercase rules.
  `src/tokens/geometry.ts` takes the plate radius, the chamfer and the new elevation.
  `src/tokens/motion.ts` adds the `sequence` and `ambient` tiers.
- `styles.css` adds `.meridian-terminal`, `.meridian-button`, `.meridian-status`,
  `.meridian-alert` and `.meridian-holo`. The package exports `Terminal`, `Button`,
  `Status`, `Alert` and `HoloLabel` beside today's five components.
- The package exports `Schematic`, `HullCrop`, `Switch` and `StepList` (7.7). Their
  classes ship in `schematic.css`, a second stylesheet entry that the page drawing them loads
  beside `styles.css`, so a guide carries none of them.
- `apps/docs/app/global.css` drops the gradient on `html`, the glass and the blur, and
  maps the Tailwind gray steps onto the new neutral roles. `meridian-theme.ts` derives the
  Nextra primary from `action`. `layout.tsx` adds the condensed family, and
  `apps/docs/package.json` pins `@fontsource/ibm-plex-sans-condensed` at 5.3.0.
  `apps/docs/components/diagram/palette.ts` rebinds its sentinels as 4.6 lists.
- `tools/meridian-ship/build_ship.py` writes the frame sidecar of 8.3 beside each
  orthographic render, and `ship_svg.py` or a sibling script writes the room-id,
  emissive and interactive masks of 8.2 per deck at 32 pixels per metre. The emissive
  mask needs a fixture field that marks a screen as emissive, which the geometry lacks
  today (lamp housings carry the flag on their light in `lights`), so the geometry gains `emissive` and `states` on each fixture (8.5), and its test
  checks the map files' ids.

Amendments made while implementing the tokens and chrome components (tech lead TL1 splits
delivery step 1 into this PR and the docs chrome PR):

- The plate's wrapper shadow is `filter: drop-shadow(0 6px 6px)`, since `drop-shadow()` takes
  no spread; `box-shadow` with the 6.3 values serves unclipped surfaces (dialogs, menus, the
  console frame, the article).
- A screen scope (`.meridian-terminal`, `.meridian-holo`, `.meridian-screen`) rebinds the
  roles to their dark values, so a status or a button inside a screen reads the same in the
  light theme.
- The generated stylesheet no longer binds `--meridian-kind`. The `meridian-kind-<kind>`
  class stays on a reference entry for the API filter and carries no style.
- The docs budget check holds the guide page's raw ceiling at 984 kB (from 981 kB) for the
  five new component classes.

Amendments made while implementing the lit cutaway (owner ruling OR5; tech lead TL22 to
TL27):

- TL22: the bay's base is the unlit cutaway. A bake de-lights the owner's `h375` pick
  against its own mesh render, sets each room to a neutral swatch and neutralises the
  painted pipes. No new painting. 8.1 and 4.5 follow; `roomSaturation` is gone.
- TL23: `internal/meridian-deck` has two entries. `.` holds the deck state and no Pixi, and
  `./view` holds `DeckView`, whose one export is `DECK_VIEW`. 8.2 says where the canvas sits.
- TL24: Pixi loads after the bay is visible and idle, and nothing loads under `saveData`,
  `prefers-reduced-data`, without WebGL2 or in forced colours. 11.2 and 13 follow.
- TL25: the fallback is the unlit base with retuned tints, and the canvas swaps them away
  when it presents. 7.7 and 8.4 follow.
- TL26: the strip of site UX 4.8 stays on the lit exterior, so 8.1 keeps a lit cutaway row.
- TL27: the work is its own pull request, ahead of the bay's Pixi tasks.

## 13. Risks

- Amber means both an action and a warning. A reader could take a link for a warning. The
  word and the glyph on every warning (4.2) tell the two apart.
- Dark screens in the light theme put heavy blocks on a pale page. The docs keep screens
  to the console and explorables, so a plain docs page stays light.
- The painted hero and bridge backdrop are the only raster art, and they depend on the
  paint-over. The mesh render stands in until then.
- The runtime art grows with the states: 42 fixtures and 16 doors, each with up to five
  frames, plus a deck base per deck. Atlases and the 32 pixels per metre scale keep it
  in a few 2048 pages per deck, and the painter starts with the props the 0.4 systems
  change.
- PixiJS v8 adds weight to the demo apps' deck route: a design research build measured
  about 176 kB gzipped for a minimal import. The deck view with its base and light layers
  measures 110 kB gzipped on the `WebGLRenderer` path (OR5 bundle check, esbuild minified),
  against a 150 kB soft row on the front page. The deck view loads it
  client-only, after the panels render.

## 14. Out of scope

- The layout of each surface: the demo apps, the front page, the feature pages, the docs
  and the Academy each get a UX spec.
- The paint-over itself, and the bridge backdrop's painting.
- Sound.
- The map runtime's code: its modules, its loader and its scene scripting, which the demo
  apps' UX spec designs.
- The Academy's progression rules and screens.
