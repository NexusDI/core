# Front page concepts: final critique (A pixel-art, B cel-shaded, C pre-flight blueprint)

Method: read all three files, the brief and the research; checked facts against /home/user/frontpage (branch concept/frontpage from release/0.4). Opened each page in headless Chromium at 1280x800/900 and 375x812, light and dark, with and without reduced motion; unplugged the Shields conduit, tried Launch, replugged, replayed power-up, tabbed through the hero, and pressed Enter on a conduit. Screenshots: `scratchpad/fp-shots/critique/` (`*-fold.png`, `*-full.png`, `*-unplugged.png`, `*-focus.png`, `b-first-paint.png`, `b-table-375.png`, `c-table-375.png`, `b-why-1280.png`).

All three pass the basics: no console errors, no network requests, no horizontal page scroll at 375, `lang="en"`, theme toggle with stored choice, a `prefers-reduced-motion` path, keyboard-operable conduits, a live region that names the missing system, Launch held with `aria-disabled` plus visible "Launch blocked" text, and an icon or text next to every red alert. None uses em dashes, "native", or reflect-metadata, and I found no bold lead-ins or "not X but Y" lines.

## Repo facts the pages must match

- Packages (all `0.4.0-rc.0`): core, decorators, errors, testing, node, devtools, federation, interceptors, cli. All three pages list all nine. Good.
- Install: README and every lib README say 0.4 is a release candidate on the npm `next` tag, and that `npm install @nexusdi/core` without `@next` installs the 0.3 line. All three pages show `npm i @nexusdi/core`, which installs 0.3. That is wrong for a page that sells `Nexus.check`.
- `Nexus.check(root, options?)` is synchronous and returns `void`. It throws one `BlueprintError` (`NEXUS_BLUEPRINT_INVALID`) whose `errors` list holds each problem. `options.plugins` exists (`CheckOptions.plugins`). It prints nothing on success.
- Error text. Core alone writes one line: `[NEXUS_MISSING_PROVIDER] token=ShieldGrid requester=Helm module=Bridge. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER` (libs/core/src/errors/nexus-error.test.ts:93). The sentence all three pages show (`Helm (module Bridge) depends on X, but no provider of X is visible in Bridge.`) is the text the `errors()` plugin from `@nexusdi/errors` writes (libs/core/src/text/core-text.ts, libs/errors parity snapshot). It is real text, but only with the plugin registered, and the pages do not register it.
- Docs: origin `https://nexus.js.org`. The root currently serves the 0.3 snapshot (apps/docs/deploy.json `snapshot-only`); 0.4 docs live under `/next/`. Pages that exist: `/getting-started/`, `/comparison/`, `/release-candidate/`, `/api-errors/`, `/errors/<CODE>/`.
- GitHub: `https://github.com/NexusDI/core` (all three correct).
- Comparison evidence in the repo: `benchmarks/results/probes.json` (InversifyJS 8.2.3: a missing provider is found at first resolve and one mistake is reported at a time; a `plain` InversifyJS variant exists, so it can run without decorators). `apps/docs/content/comparison.mdx` measures InversifyJS, tsyringe, awilix and needle-di, and explicitly leaves NestJS out (NestJS is a framework with its own container). So "check versions on the full comparison" covers InversifyJS but not NestJS.

---

## Concept A: pixel-art (`concepts/frontpage/concept-a.html`)

### Strengths

- The strongest one-glance metaphor legend ("Room = module, Chip = provider, Pipe = dependency, Hatch = export") and a pixel font headline with real character.
- Best power-up narration: the live caption reads "Deck 2. Tactical and Comms starting, after Engineering", which states dependency order in words. Launch stays blocked while the decks light.
- The red alert banner is the clearest of the three: "RED ALERT: BRIDGE. Missing system: Shields. Helm in Bridge needs Shields, and the conduit is unplugged. Launch blocked." with a Replug button inside it.
- Duplicated conduit buttons beside the ship make the interaction work at any size, and the SVG conduits show a dashed focus box.
- Its comparison table is the most careful of the three (PART at bootstrap, NO at resolve time).

### Must-fix

1. The starfield squares render on top of the hero subhead (they cover letters in "dependency", "with", "whole graph" at 1280 and 375). Put the star layer behind text (`z-index` below `.hero` copy) or keep stars out of the text column.
2. First paint shows the ship unlit, and the power-up autoplays for about 3.5 s with Launch disabled. Paint the final lit state on load and run the power-up only on "Replay power-up"; keep a replay under 2 s.
3. No install line in the hero, and at 1280x800 the ship and Launch sit below the fold. Add the install line with its copy button under the CTAs, and cap the headline size (about 56px at desktop) so the ship's top half and the Launch button show in the first screen.
4. In the code panel, drop `await` from `await Nexus.check(Meridian);`. The call is synchronous and returns `void`.
5. The success output `ok  Meridian: 4 modules, 8 providers, 4 conduits checked` is text Nexus.check never prints. Add `console.log('pre-flight ok');` after the call and print exactly that line.
6. `$ node preflight.ts` fails on the supported floor (Node 22.12 needs a flag to strip types). Use `$ npm run preflight`.
7. Comparison row "Private providers, explicit exports": InversifyJS `PART container modules` is generous; container modules group bindings and have no exports. Make it `NO` with the note "no exports".
8. "Next to the small containers, NexusDI matches them feature for feature." cannot be backed (awilix's `loadModules` auto-registration, for one, has no NexusDI equivalent). Use the shared wording in X6.
9. The footnote "Based on each project's public documentation. Check the version you use." has no versions, date or link. Use the shared footnote in X5.
10. At 375 the header wraps the theme toggle onto its own row, and the three-line pixel headline's offset shadow collides between lines. Keep GitHub and the toggle on one row (icon-only toggle with its `aria-label`), and cut the shadow offset to 2px on small screens.

### Nice-to-have

- The ship at 375 is small (section labels about 7px tall). Stack the four rooms vertically on phones, as B and C do.
- The unplugged pipe is hard to see on the ship. Draw a visible gap or a dangling plug sprite.
- The comparison table scrolls sideways inside its box at 375 (552px in 343px). Acceptable, but a stacked card per row reads better.
- Package badges have no links. Link each to its npm page or README.
- The "Parts bay" is a 4-column card grid, close to the stock grid the brief warns against. A row of pixel ship parts docking onto the hull would fit the art better.

---

## Concept B: cel-shaded (`concepts/frontpage/concept-b.html`)

### Strengths

- The most fun of the three, and the closest to "a sales page with graphics": a cartoon rocket cutaway, comic sound effects ("VROOM!", "ZAP!", "BEEP!", "PING!") as decks light, a "Shields missing!" speech bubble and an ALERT starburst on the Bridge, a hazard-striped "LAUNCH BLOCKED" button.
- Install line with copy button sits in the hero, inside the first screen at 375 and 1280.
- At 375 the ship turns vertical (nose up), the cleanest mobile schematic of the three.
- Code panel uses `Nexus.check(Meridian);` without `await`, the only correct call of the three.
- Skip link, Docs link in the header, and a link to the full comparison.

### Must-fix

1. Comparison row "Runs without a web framework: Nest NO" is false. NestJS documents standalone applications (`NestFactory.createApplicationContext`) with no HTTP server. Delete the row.
2. Row "Checks the whole graph before anything is built: Nest NO" overstates. NestJS fails at bootstrap, while it instantiates providers. Mark it `PARTLY` with "at bootstrap", as A does.
3. The "INVERSIFY" column header is clipped at 1280 and at 375 (95px of text in a 92px cell, 59 in 56). Let the column grow or use a smaller header size.
4. In the "PLAIN" why card, the toggle illustration overlaps "Runs under" at 1280 (`b-why-1280.png`). Move the art up or give the text a right margin.
5. First paint shows every section grey while the status says "ALL CLEAR ... Launch is open", the terminal says PASS, and Launch is enabled. The same mismatch happens on Replay. Paint lit on load and power up only on Replay. During any power-up, keep Launch `aria-disabled`, set the terminal to a "powering up" line, and announce each deck in the live region ("Deck 1. Engineering online." ... "Deck 3. Bridge online, after Tactical and Comms.").
6. At 1280 the headline runs five lines at about 95px and leaves the right half empty; only the ship's top edge shows at 800px tall. Cap the headline at about 64px, or put the ship to the right of the headline.
7. The subhead never says what NexusDI is. Start it with "NexusDI is dependency injection for TypeScript." then keep "It builds your app from modules and checks the whole graph before anything runs."
8. Footer "Starship Meridian is the crew you meet in the docs." A ship is not a crew. Use "The Starship Meridian is the ship you build in the docs."
9. `import { Meridian } from './meridian.module';` cannot resolve in an ESM package. Use `'./meridian.js'`.
10. The output `PASS Nexus.check(Meridian) found no wiring mistakes.` is not printed by Nexus.check. Add `console.log('pre-flight ok');` to the code and print that.
11. The "TINY" why card reads as a size claim, which the research rules out against the small containers. Rename it "ZERO DEPS" and keep "No runtime dependencies."

### Nice-to-have

- The "CAUGHT!" card is mostly empty space at 1280. Shrink it or let the art fill it.
- Mark core as required and the other eight as optional in "Ship parts", as A does; link each to npm.
- "@nexusdi/devtools: Draw the module graph live." "Live" is loose; use "Draw the module graph and follow each instance."
- The "@" glyph inside the decorators badge is read aloud; mark the badge art `aria-hidden="true"`.
- The two "Reactor" conduits have the same label on the ship; name them "Reactor to Tactical" and "Reactor to Comms" on the ship tags too.

---

## Concept C: pre-flight console blueprint (`concepts/frontpage/concept-c.html`)

### Strengths

- The clearest explanation of the mapping: hand-written blueprint annotations point at a section ("section = module"), a hatch on Tactical's edge ("hatch = export"), a system and a conduit. It is the only page where the export hatch reads at a glance.
- The ship paints lit at first load (status "ALL SYSTEMS LIT"), and the power-up replays deck by deck with D1, D2, D3 deck numbers on each section.
- The failure state is complete and legible: Bridge glows red with a warning triangle and "RED ALERT, ShieldGrid missing", the unplugged conduit shows an X, the terminal prints the error in red, a per-section PASS list sits under it, and the launch key panel reads "LAUNCH BLOCKED. Bridge is missing ShieldGrid. Replug to unlock."
- The headline subhead names the product precisely ("a typed dependency injection library for TypeScript"), and token names (ShieldGrid, ReactorCore) match the repo's own examples.
- The red marker circle around "fail CI" is a good hand-drawn touch, and the comparison table is mostly accurate.

### Must-fix

1. The comparison table breaks at 375 (`c-table-375.png`): "constructor" and "dependency" spill across column borders and "INVERSIFY" is clipped, because the wrapper has `overflow-x: hidden`. Stack each row as a small card on narrow screens, or allow `overflow-wrap: anywhere` with `overflow-x: auto`.
2. Row "Works without decorators: Inversify ✗ No" is wrong; the repo's own benchmark builds an InversifyJS `plain` variant without decorators. Mark it "~ Partly".
3. Code panel: drop `await` from `await Nexus.check(Meridian);` (synchronous, returns `void`) and add the missing `import { Meridian } from './meridian.js';`.
4. The success output `✓ Meridian: 4 modules, 8 providers, no errors` is not printed by Nexus.check. Add `console.log('pre-flight ok');` to the code and print that.
5. Too many controls in the hero. The research caps the front page at three interactions; C offers four ways to unplug (ship couplings, breaker bank, patch bay cables, drag) plus gauges with invented readings (REACTOR 88%, SIGNAL 76dB). Keep the couplings and the breaker bank (the accessible list), and delete the patch bay and the gauges. The patch bay also shows "plug me back in" while every plug is in.
6. Why item 01 "CI names the missing system, before runtime." Nexus.check is runtime code that runs in CI. Use "CI names the missing system before you deploy."

### Nice-to-have

- The art is the least cartoonish of the three. The owner asked for fun; add one or two characterful touches (a crew figure at the Bridge window, a stamped "LAUNCH BLOCKED" rubber stamp on the sheet).
- The "click a coupling to unplug it" annotation overlaps the hull line; nudge it up.
- The routed red line from Tactical to Bridge in the alert state crosses the hull outline; route it inside the hull.
- On mobile the Replay and Reset buttons push the ship below the fold; put them under the ship on narrow screens.

---

## Cross-concept items (apply to all three)

X1. Install line. Change every `npm i @nexusdi/core` (A once; B twice, hero and closing band; C once) and its copy-button payload to `npm i @nexusdi/core@next`, with a small caption beside it: "0.4 is a release candidate on the npm next tag." When 0.4.0 ships to `latest`, drop `@next` and the caption.

X2. Links.

- Get started: `https://nexus.js.org/next/getting-started/` (A and C point at the GitHub README; B points at the site root, which serves the 0.3 docs).
- Docs: `https://nexus.js.org/next/`.
- Full comparison: `https://nexus.js.org/next/comparison/` (only B links one; add it to A and C).
- Error code in the terminal: link `NEXUS_MISSING_PROVIDER` to `https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER/` (the URL core's own one-line message uses, without the trailing slash).
- GitHub: `https://github.com/NexusDI/core` (already right everywhere).
- If the front page ships inside the `/next/` build itself, write these as site-relative links instead.

X3. Code and error output. Use one code sample and one output on all three pages:

```ts
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { Meridian } from './meridian.js';

Nexus.check(Meridian, { plugins: [errors()] }); // CI runs this
console.log('pre-flight ok');
```

Passing output: `$ npm run preflight` / `pre-flight ok` / `exit 0`.
Failing output (Bridge no longer imports Tactical, so ShieldGrid is out of reach):

```
[NEXUS_BLUEPRINT_INVALID] the module graph has 1 error; nothing was built.
  [NEXUS_MISSING_PROVIDER] Helm (module Bridge) depends on ShieldGrid, but no provider of ShieldGrid is visible in Bridge.
      ShieldGrid is exported by Tactical, which Bridge does not import.
      Fix: import Tactical into Bridge.
exit 1
```

Highlight the `NEXUS_MISSING_PROVIDER` line as "the one line". The Fix line sells the errors package and fits the ship story (replugging the conduit is the fix). If the page must show core alone with a single line, drop the `errors` import and the `plugins` option and print the real core text instead: `[NEXUS_MISSING_PROVIDER] token=ShieldGrid requester=Helm module=Bridge. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER`. Do not pair the plugin's sentence with code that does not register the plugin, which is what all three do today. Keep names consistent across pages: Helm in Bridge depends on ShieldGrid in Tactical (A and B use "Shields", and B uses "Computer" as the requester).

X4. Ship terms next to real terms in the alert. Research asks that ship words always sit beside the real ones. Make the alert read, for example, "RED ALERT: Bridge (module) is missing ShieldGrid (provider). Launch blocked."

X5. Comparison facts. Use this matrix, which I can stand behind from the repo's benchmarks and the projects' own docs:

| Feature                                            | NexusDI           | NestJS container                      | InversifyJS                             |
| -------------------------------------------------- | ----------------- | ------------------------------------- | --------------------------------------- |
| Missing provider found before any constructor runs | Yes (Nexus.check) | Partly: at bootstrap, while it builds | No: at first resolve                    |
| Every missing provider in one error                | Yes               | No: the first one                     | No: the first one                       |
| Modules with private providers and exports         | Yes               | Yes                                   | No: container modules have no exports   |
| Async factories finish at startup                  | Yes               | Yes                                   | Partly: resolved with getAsync          |
| Constructor injection with no compiler flags       | Yes               | No: needs decorator flags             | Partly: its decorated setup needs flags |

Drop B's "Runs without a web framework" row (false for NestJS). Footnote: "InversifyJS 8.2.3, measured by the NexusDI benchmark harness. NestJS from its documentation. Read 2026-09-30." Before publishing, pin the NestJS major you checked (I could not reach nestjs.com from here) and either add NestJS to `apps/docs/content/comparison.mdx` or link the footnote to the NestJS docs pages for providers and modules. The comparison page leaves NestJS out today, so "check versions on the full comparison" does not cover it.

X6. Small containers line. "Matches them feature for feature" (A), "matches on features" (B) and "matches the small containers too" (C) are claims the comparison page does not back (awilix auto-registration, for one). Use: "Up against tsyringe, awilix and needle-di? See the full comparison." with the link from X2. If the owner wants a parity claim, name it: "Tokens, factories, scopes and disposal, as in the small containers."

X7. Package list. All nine names are right everywhere. Mark `@nexusdi/core` as the one you need and the rest as optional (B and C do not), and link each package to `https://www.npmjs.com/package/@nexusdi/<name>`. Keep each line within the package.json description's claim.

X8. Version stamp. Show "0.4.0-rc.0" (or "0.4 RC") once near the install line, as the research asks for proof. C's "NX-0.4" drawing stamp is a nice place for it.

---

## Ranking and recommendation

1. **B (cel-shaded)**: the owner's brief in one look. It is fun, it is mostly graphics, the install line is in the hero, the ship works best on a phone, and the Bridge's "Shields missing!" bubble with the hazard-striped Launch button lands the claim. Its faults are mostly copy and facts (two wrong NestJS rows, a mislabelled footer) plus one state bug in power-up, and all are small edits. 11 must-fix.
2. **C (blueprint console)**: the clearest and most honest teaching, the only lit first paint, and the best hatch and alert depiction. It is calmer than the owner asked for, the hero carries four redundant unplug widgets and fake gauges, and its table breaks at 375. 6 must-fix.
3. **A (pixel-art)**: charming and the best power-up narration, but the starfield covers the subhead, the first paint is unlit for 3.5 s, the hero lacks the install line, and the phone ship is tiny. 10 must-fix.

Recommendation: build on B. Apply X1 to X8 and B's must-fix list, then borrow three things: C's blueprint-style annotations that point at a section, a hatch and a conduit (B's legend sits below the ship); C's per-section PASS and FAIL list under the terminal; and A's deck-by-deck caption ("Deck 2. Tactical and Comms starting, after Engineering") as the power-up's live-region text, which also fixes B's must-fix 5.
