# Front page research for NexusDI

Date: 2026-10-02

## Method and limits

Every direct fetch was blocked by the network egress proxy (bun.sh, vercel.com, astro.build, hono.dev, trpc.io, encore.dev, encore.dev/blog/queueing, samwho.dev, docs.evanion.com). Findings below come from web search summaries and from general knowledge of the sites. Items marked "unverified" were not confirmed against the live page in this session. Layout details (exact copy, section order, mobile behaviour) should be re-checked by a human with a browser before they are cited as fact.

## Sources used

- https://bun.com/ and https://bun.sh/blog/bun-v1.0
- https://hono.dev/docs and https://hono-website.pages.dev/concepts/benchmarks
- https://trpc.io/ and https://github.com/trpc/trpc
- https://encore.dev/blog/queueing
- https://newsletter.samwho.dev/archive/new-post-queueing-an-interactive-study-of/
- https://writethatblog.substack.com/p/sam-rose-on-technical-blogging
- https://github.com/samwho/visualisations
- https://samwho.dev/load-balancing/ , https://samwho.dev/memory-allocation/ , https://samwho.dev/hashing/
- https://github.com/withastro/astro and https://docs.astro.build/en/getting-started/

## Per site

### Bun (bun.sh, now bun.com)

- Headline: a short claim, "a fast all-in-one JavaScript runtime", with a toolkit subhead (runtime, package manager, test runner, bundler in one binary).
- Install line: a copyable curl command sits in the hero, with the version number shown.
- Hero visual: mostly a speed chart. Search results confirm bar charts such as bun install at 0.21s against yarn 1.76s, pnpm 1.92s and npm 4.45s on a warm Next.js cache.
- Proof: benchmark bars, a WebSocket throughput chart (4.17M messages per second against about 124K for Deno and Node), logos, testimonials (unverified), and code snippets per feature.
- Pattern: one number per claim, drawn as bars, with the competitors named.

### Vercel (vercel.com)

Not loaded. From general knowledge (unverified): short headline, one sentence subhead, two CTAs (start deploying, get a demo), a large abstract graphic, customer logo strip directly under the hero, then metrics from named customers. The strongest lesson is the logo strip plus hard numbers directly below the fold. It has a polished light and dark theme. It is a sales page with graphics, which matches the owner's description.

### Astro (astro.build)

Not loaded. Search confirms the tagline "The web framework for content-driven websites" and the islands idea (mostly static HTML with small hydrated islands). From general knowledge (unverified): the hero carries a playful space theme with illustrated planets, an install command (npm create astro@latest), a Get Started button, then sections on islands, content collections, performance scores and showcase sites. Astro shows that a themed, illustrated identity can sit comfortably on a serious tool. This is the closest precedent for the Starship Meridian direction.

### Hono (hono.dev)

- Headline: "Ultrafast web framework" with a short subhead (small, simple, built on Web Standards).
- Proof: a router benchmark table (about 402,820 ops per second against 297,036, 212,598 and 197,345 for rivals), size claims (hono/tiny under 14kB, zero dependencies), a runtimes list (Cloudflare Workers, Deno, Bun, Node.js, Vercel, Lambda), and a "who is using Hono" section.
- Pattern: a handful of crisp claims, each backed by a number, then code snippets showing the API in a few lines.

### tRPC (trpc.io)

- Headline: "Move Fast and Break Nothing. End-to-end typesafe APIs made easy."
- Claims: no code generation, no runtime bloat, no build step, autocompletion inferred from the API.
- Hero visual (unverified): a split editor demo where changing the server code produces an instant type error in the client. This is the best precedent for our CI failure story, because the headline promise (breakage is caught early) is shown happening.
- Proof: adapter list, sponsor and user logos, a short feature grid.

### Encore (encore.dev and the queueing post)

- encore.dev home page was not loaded. From general knowledge (unverified): the hero shows a short pitch, a code sample next to a generated architecture diagram or flow view, and a Get Started CTA. The idea of code on one side and a live picture of the system on the other is directly relevant to NexusDI.
- Queueing post: confirmed by search to be a 3 month, 70 hour interactive essay by Sam Rose, published on the Encore blog. It begins by showing what happens without queues, and the reader drives the post. It uses a goals system and a drop zone at the bottom where dropped requests collect. Encore funds this kind of content as brand building.

### samwho.dev

- Posts: load balancing, memory allocation, hashing, queueing. Each takes one to three months to make and is built bottom-up.
- Controls: every simulation has play and pause, a speed slider and a reset.
- Teaching method: start with the simplest case, show it break, add one idea at a time, let the reader change one parameter and see the result at once. Ends with comparison graphics for the algorithms.
- Code: the visualisations are open source at https://github.com/samwho/visualisations.
- Lesson: each widget has one lesson. Interactions are small and consistent, so the reader learns the controls once.

### docs.evanion.com

Not loaded. The owner already judges it weak, so it serves as the "before" state. Use it as a baseline to compare against after the redesign.

## Synthesized principles

### Above the fold

- Headline is under 10 words and states an outcome (Bun, Hono, tRPC all do).
- Subhead is one sentence that names the category and the main differentiator.
- Primary CTA is Get Started. The secondary CTA is a link to a live demo, or to GitHub.
- An install line is copyable and sits within the first screen. Bun and Astro both do this.
- Something concrete appears before any scrolling: a number, a chart, or a running demo.

### Hero visual

- Static hero art is common (Vercel, Astro). Visuals that demonstrate the promise are rarer and more memorable (tRPC type errors, Encore flow diagrams).
- The visual should show the product doing its job, and the headline should be readable from the visual alone.

### Interaction

- Fast tools use charts as the main proof. Teaching tools (samwho, Encore queueing) use manipulable simulations.
- Good widgets have one lesson, play and pause, a speed control and a reset, and they work with a single click.
- Interaction teaches a concept that prose explains poorly, such as ordering over time, failure, and flow.

### Proof sections

- Benchmarks (Bun, Hono) must name competitors and units.
- Logo strips and testimonials (Vercel, Hono) are credible only with real names. NexusDI has no such list yet, so substitute other proof (see below).
- Code samples should be short and runnable, shown beside the output or error they produce.

### CTAs and page length

- A single primary action repeated at the top and bottom.
- Fast tools keep pages to roughly five to eight sections. Detailed teaching goes to docs or a separate essay.

### Theming and mobile

- Strong sites ship both light and dark and keep the hero legible in both. Dark is the default for tools such as Bun and Astro (unverified).
- Hero demos usually collapse to a simplified static or vertical layout on phones, with the install line still visible.

## Recommendations for NexusDI

### What the hero must show in the first 5 seconds

- The headline "Wiring mistakes fail CI before a user hits them." in large text, with a one sentence subhead naming NexusDI as a typed dependency injection library for TypeScript.
- The ship schematic already powered and lit, with four labelled sections (Engineering, Bridge, Tactical, Comms) and visible conduits.
- One obvious action on the ship: a single conduit with a hint such as "Unplug me". The reader should see that something can be touched.
- The install line and a Get Started button without scrolling.
- Nothing needs to load before the picture appears. The ship shows its final lit state at first paint, and the power-up replay is optional.

### Interaction budget

- Three interactions at most on the front page: power-up replay, unplug a conduit (red alert, launch blocked), and replug (launch clears).
- Each one resolves in under two seconds and runs on a single click or tap.
- Include a Replay and a Reset control, as samwho does.
- Honour prefers-reduced-motion with a static state and a text caption that names the failure.
- Deeper teaching (async startup order, exports as hatches) belongs on a separate explainer page in the samwho style, linked from the front page.
- Show the same story as code beside the ship: the unplugged conduit corresponds to a Nexus.check failure with the missing system named. This borrows the tRPC trick of showing the error appear.

### Comparison teaser

- A compact table with NexusDI, NestJS container, InversifyJS and one column for the small containers (tsyringe, awilix, typed-inject).
- Rows are limited to checks that can be verified: compile or startup wiring checks, async startup ordering, module exports, size, dependencies.
- Compare feature for feature against the large containers. Against the small ones, claim parity on features only, and do not claim size or speed wins.
- Link to a full comparison page. Cite dates and versions of the competitors, as Hono and Bun cite benchmark conditions.

### "Why" strip

- Three short items, each with a small icon in the ship style:
  - Wiring errors surface in CI with the missing system named.
  - Async startup runs in dependency order.
  - Modules export what they choose to, and nothing else.
- Each item is one line of text plus a link to the matching doc page.
- Keep claims measurable so they can be tested.

### Install line and packages

- One line: the package manager command for the core package, with a copy button. Show the version.
- Under it, a short packages list with one sentence each (core, check or CI tooling, any adapters), each linking to its docs page.
- If packages differ by use, label them in ship terms only in captions, with the real package name always visible.

### Proof when there are no logos

- A real GitHub link, version, license and test or type coverage badges.
- A 10 to 15 line code sample beside the matching Nexus.check output.
- A published CI run showing the failure on a wiring mistake.
- Add testimonials only when they are real and named.

### Page structure and theming

- Order: hero, why strip, code beside check output, comparison teaser, packages and install, final Get Started.
- About six screens on desktop.
- Design the ship for both light and dark. Dark reads as a ship at night with lit decks. For light, use a blueprint or daytime palette so red alert still stands out. Check contrast of the red alert in both themes.
- On mobile, turn the schematic into a vertical stack of sections, keep the unplug interaction as a tap on a conduit, and keep the install line within the first screen.

### Pitfalls to avoid

- Spending the hero on art with no demonstrated claim, which repeats the weak-page problem.
- Interactions that need instructions. The hint text should be one short phrase.
- Heavy animation that delays first paint or blocks the install line.
- Names that obscure the product. Ship terms must always sit next to the real terms (module, provider, export).
- Comparison claims against small containers that NexusDI cannot support, and unsourced or undated claims against large ones.
- Red alert as the only signal. Add text and an icon for colour blind readers and screen readers.
- Autoplay sound.
- Long scrolling storytelling. The front page sells, and the docs and explainers teach.
- Fake logos and testimonials.
- Placing the full lore of the ship on the front page. A reader should grasp the mapping in one glance.
