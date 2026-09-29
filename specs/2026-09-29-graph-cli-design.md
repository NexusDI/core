# Graph CLI and export (#18)

Status: draft for the owner, rulings applied (section 9).
Issue: NexusDI/core#18, "Graph Visualization": a `nexusdi graph` command that exports the
dependency graph as DOT, JSON, SVG and PNG.
Depends on: the 0.4 engine on `feat/core-0.4` (PR #60, open, not merged), specifically
`inspect()` and `NexusGraph` in `@nexusdi/devtools` and `Nexus.check` in core
(`specs/2026-09-23-core-0.4-design.md` revision 2, sections 3.5, 3.10, 10 and 10.1).
This spec changes no core API. Section 3.10.8 of the core spec already records "#18: a
CLI calls `inspect()` and renders the JSON", and this design confirms that the plugin API
needs nothing more.

## 1. What 0.4 already ships

- `inspect(root, { load, plugins })` runs `Nexus.check` with `devtools()` registered and
  returns a `NexusGraph` (plain JSON: modules, providers, edges). It builds nothing. It
  throws the `BlueprintError` that `Nexus.check` throws, with `@nexusdi/errors` text.
- `graph(ship)` returns the same shape for a live container registered with
  `devtools()`, including modules added by `load()`.

What is missing, and what this spec adds:

1. A way to run `inspect()` on an app from a shell, including a TypeScript entry file,
   with no build step and no compiler flags.
2. Renderers from `NexusGraph` to DOT and Mermaid text.
3. SVG and PNG output, which need a layout engine.

## 2. Package placement

Two additions, in two packages:

| Package              | Adds                                                                                                                                                           | Runs in                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `@nexusdi/devtools`  | `toDot(graph, options?)`, `toMermaid(graph, options?)`, the `RenderOptions` and `GraphView` types, and an `implementation` field on each `NexusGraph` provider | any runtime, browser included |
| `@nexusdi/cli` (new) | the `nexusdi` bin; no library export                                                                                                                           | Node only                     |

Why the renderers live in `@nexusdi/devtools`:

- They are pure functions from `NexusGraph` to a string, with no `node:` import, so the
  docs playground, a browser devtools panel and a server's debug endpoint can call them
  on `graph(ship)` with no CLI installed.
- `@nexusdi/devtools` is `sideEffects: false`, so an app that imports `devtools()` and
  never calls a renderer bundles none of them.

Why the CLI is a separate package, with no bin in `@nexusdi/devtools`:

- The CLI needs `node:fs`, `node:module`, `node:util` and `process`. Core spec section
  12.1 allows `node:` imports in `@nexusdi/node` only, and `@nexusdi/devtools` must stay
  browser-safe for the playground. A separate package keeps that rule true for every
  package an app bundles; the rule gains one named exemption, `libs/cli/src`, for a
  package no app bundles.
- The CLI's optional peers (section 6) belong on the package that loads them. On
  `@nexusdi/devtools` they would show up as install warnings or prompts in every project
  that registers the plugin.
- A `nexusdi` bin needs a home that later commands can share. `@nexusdi/codemod` keeps
  its own `npx @nexusdi/codemod` entry, as core spec section 13.2 states.

`@nexusdi/cli` manifest, beside the other packages' shape (core spec section 12.2):

```json
{
  "name": "@nexusdi/cli",
  "type": "module",
  "bin": { "nexusdi": "./dist/bin.js" },
  "exports": { "./package.json": "./package.json" },
  "engines": { "node": ">=22.12" },
  "dependencies": {},
  "peerDependencies": {
    "@nexusdi/core": "0.4.0",
    "@nexusdi/devtools": "0.4.0",
    "tsx": "^4.20.0",
    "@viz-js/viz": "^3.20.0",
    "@resvg/resvg-js": "^2.6.0"
  },
  "peerDependenciesMeta": {
    "tsx": { "optional": true },
    "@viz-js/viz": { "optional": true },
    "@resvg/resvg-js": { "optional": true }
  }
}
```

`@nexusdi/devtools` is a peer because of section 4.3: the CLI must use the project's copy
of devtools, and through it the project's copy of core.

## 3. The command

```
nexusdi graph <entry> [options]

<entry>                  path[#export]. A .ts, .mts, .cts, .js, .mjs or .cjs file, or a
                         .json file holding a NexusGraph.
-f, --format <format>    mermaid | dot | json | svg | png
-o, --out <file>         write to a file; stdout when absent
    --view <view>        providers (default) | modules
    --load <path#export> a module to compile after the root, as load() would; repeatable
    --plugins <path#export>
                         an exported array of plugins that Nexus.check registers
-h, --help
-v, --version
```

```bash
npx nexusdi graph src/meridian.module.ts#Meridian
npx nexusdi graph src/meridian.module.ts#Meridian -o docs/graph.svg
npx nexusdi graph src/meridian.module.ts#Meridian --view modules -f dot | dot -Tpng > graph.png
npx nexusdi graph src/meridian.module.ts#Meridian --load src/science.module.ts#Science
```

The format comes from `--format`, else from the extension of `--out` (`.mmd` and
`.mermaid`, `.dot` and `.gv`, `.json`, `.svg`, `.png`), else `mermaid`. A `--format` that
disagrees with the `--out` extension is honoured as given.

`mermaid` is the default because it renders with nothing installed: GitHub, GitLab, the
docs site and mermaid.live all draw it, which is where a user shows a graph to a
reviewer.

### 3.1 Entry and exports

`path#export` names an export of a module file. With no `#export`, the CLI takes the
`default` export. When the file has no default export, the CLI exits 2 and lists the
file's exports, so the next command is obvious:

```
nexusdi: src/meridian.module.ts has no default export.
  Its exports: Meridian, COMMS_OPTIONS
  Pass one: nexusdi graph src/meridian.module.ts#Meridian
```

The root export is any `RootRef` that `Nexus.check` accepts: a module, a provider array,
or `{ providers, imports, exports }`. The CLI hands it to `inspect()` unchanged, so core
does the validation. Core throws an object root with other keys as
`NEXUS_INVALID_MODULE` before it compiles; the CLI prints core's message, which ends in
its Fix line, and exits 2, because the input is wrong and no graph was checked. Every
other bad value reaches the compile and is a `BlueprintError`, exit 1 (ruling 11).

`--load` exports are modules, compiled in flag order, as `CheckOptions.load` does. A
`.json` file after `--load` or `--plugins` exits 2, since it has no exports. When a
`--load` or `--plugins` file lacks the named export, the fix line repeats that flag.
`--plugins` names one export holding a `NexusPlugin[]`. The graph depends on compile
hooks: `@nexusdi/federation`'s `tokenKey` merges contract tokens, and without it a
federated shell's graph reports duplicates that the running app never has. A value that
is not an array exits 2.

A `.json` entry is read as a `NexusGraph`, for instance one a running app wrote with
`JSON.stringify(graph(ship))`. That graph carries `load()` modules and each factory's
`async` result, which `inspect()` cannot know. `--load` and `--plugins` with a `.json`
entry exit 2. The CLI checks the shape: `modules`, `providers` and `edges` arrays whose
items carry the string ids and fields section 10.1 lists, and every edge endpoint names a
provider. A file that fails the check exits 2 and names the first bad path, such as
`providers[3].module`.

### 3.2 Import side effects

The CLI imports the entry file, which runs its top-level code. The docs tell users to
point the CLI at the file that defines the root module. `main.ts` is the wrong entry. When an entry
does start something (a server calling `Nexus.create` at the top level), the CLI still
finishes: it writes its output and then calls `process.exit(code)`, so an open handle in
user code cannot keep the process alive. An entry that throws while it is imported exits
2 and prints the thrown error's stack.

### 3.3 Exit codes

| Code | Meaning                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | The graph was written.                                                                                                                                                                                                                                 |
| 1    | `Nexus.check` threw a `BlueprintError`. The CLI prints its message (the `@nexusdi/errors` text) to stderr and writes no output.                                                                                                                        |
| 2    | The invocation or the input is wrong: an unknown flag or format, a missing file or export, an entry that threw on import, a bad JSON graph, PNG to a terminal, an unwritable `--out`. Any error the CLI did not classify also exits 2, with its stack. |
| 3    | The environment lacks something: no TypeScript loader for a `.ts` entry, `@nexusdi/devtools` not installed or at another version, `@viz-js/viz` or `@resvg/resvg-js` missing for SVG or PNG.                                                           |

Code 1 is the one CI keys on: `nexusdi graph src/meridian.module.ts#Meridian -f json -o graph.json`
fails the job exactly when the graph is invalid, and uploads the graph when it is not.

Every message on stderr starts with `nexusdi:` and, for codes 2 and 3, ends with the
command or install line that fixes it.

## 4. Loading the entry

### 4.1 JavaScript entries

`.js`, `.mjs` and `.cjs` files are imported with `import(pathToFileURL(path))`.

### 4.2 TypeScript entries

A user runs `npx nexusdi graph src/app.module.ts` with no flags and no build. The CLI
tries, in order:

1. `tsx`, resolved from the entry file's directory. When found, the CLI calls `register()`
   from `tsx/esm/api` once, then imports the entry and `@nexusdi/devtools` through the
   ordinary loader. tsx reads the project's `tsconfig.json` (paths, `.js` specifiers
   that name `.ts` files) and lowers standard decorators, so a `@nexusdi/decorators` app
   loads as it does under `tsx` itself.
2. A direct `import()` of the entry. A loader the user registered by starting the CLI
   under `node --import` loads it, and so does Node's built-in type stripping when
   `process.features.typescript` is truthy (Node 22.18 and later, or an earlier 22.x
   run with `--experimental-strip-types`). Stripping covers erasable TypeScript whose
   relative imports name `.ts` files.
3. When the import in step 2 fails with one of these codes, the CLI exits 3:
   - `ERR_UNKNOWN_FILE_EXTENSION`: no loader and no type stripping.
   - `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`: an enum, a parameter property, a decorator.
   - `ERR_MODULE_NOT_FOUND` for a specifier ending in `.js` whose `.ts` sibling exists.

```
nexusdi: src/app.module.ts is TypeScript that this Node cannot load (ERR_UNKNOWN_FILE_EXTENSION).
  Install tsx in the project: npm i -D tsx
```

Any other error thrown by the import is the entry's own failure, exit 2 (section 3.2).

The CLI resolves tsx from the entry's directory only, with no fallback to its own
location: the loader for a project's code is the project's choice, and a user who wants
no tsx gets none.

The CLI calls `register()`. tsx's `tsImport()` loads the import graph under a namespaced
URL, which would give the entry its own copy of `@nexusdi/core`, and core would reject
every module as `NEXUS_INVALID_MODULE` with `otherCopy` set (core spec, the package
split). A test pins this with a TypeScript fixture.

A user whose project runs another loader (swc, ts-node) and has no tsx installed starts
the CLI under it:
`node --import @swc-node/register/esm-register node_modules/@nexusdi/cli/dist/bin.js graph ...`.

### 4.3 One copy of core

The entry file imports `@nexusdi/core` from the project's `node_modules`. `inspect()`
must run on that same copy, or core rejects the user's modules. So the CLI never
imports `@nexusdi/devtools` from its own location. It resolves `@nexusdi/devtools` with
`createRequire(entryFile).resolve()`, imports that file, and uses its `inspect()`,
`toDot()` and `toMermaid()`. For a `.json` entry it resolves from the current directory.

When the resolve fails, or the resolved `package.json` version differs from the CLI's
own version, the CLI exits 3:

```
nexusdi: @nexusdi/devtools 0.4.0 is required next to @nexusdi/cli 0.4.0; found none.
  Install it: npm i -D @nexusdi/devtools@0.4.0
```

`@viz-js/viz` and `@resvg/resvg-js` resolve from the entry's directory first and then
from the CLI's own location, so a one-off `npx` run uses what the project has installed.

## 5. Renderers

```ts
import { inspect, toDot, toMermaid } from '@nexusdi/devtools';

export type GraphView = 'providers' | 'modules';

export interface RenderOptions {
  /** providers (default): providers grouped by module. modules: the module import graph. */
  readonly view?: GraphView;
}

export function toDot(graph: NexusGraph, options?: RenderOptions): string;
export function toMermaid(graph: NexusGraph, options?: RenderOptions): string;
```

```ts
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useClass: StellarCharts })],
  exports: [NAV_CHARTS],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Navigation],
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});

const mermaid = toMermaid(inspect(Meridian));
```

Both functions are pure and deterministic: the output follows the graph's own order,
carries no timestamp, and ends with one newline. Two runs on one app give byte-identical
files, so a committed graph diffs cleanly in review.

### 5.1 The providers view

- Each module is a cluster labelled with its name. A global module's label reads
  `Name (global)` and its border is bold.
- Each provider is a node. Its first label line is the token's display name. When the
  provider is a class provider whose class name differs from the token name, a second
  line gives the class (`StellarCharts`), from the new `implementation` field. A third
  line lists what differs from the default: the kind when it is not `class`, the
  lifetime when it is not `singleton`, and `on first get` for `eager: false`, joined by
  `, `.
- The node shape shows the kind, with the same mapping in both formats:

  | Kind      | DOT shape       | Mermaid shape |
  | --------- | --------------- | ------------- |
  | `class`   | `box`           | `["..."]`     |
  | `factory` | `hexagon`       | `{{"..."}}`   |
  | `value`   | `parallelogram` | `[/"..."/]`   |
  | `alias`   | `ellipse`       | `(["..."])`   |

- A provider its module exports has a double border (DOT `peripheries=2`, Mermaid class
  `exported` with a 3px stroke).
- Edges run from the dependent to the dependency. `required` is a plain arrow. The other
  kinds carry their kind as a label, so the graph reads the same in grayscale: DOT uses
  `style=dashed` for `optional` and `alias`, `style=dotted` for `lazy`, `style=bold` for
  `all`; Mermaid uses `-. optional .->`, `-. lazy .->`, `== all ==>` and `-- alias -->`.
- Module imports are not drawn in this view; the modules view draws them.

### 5.2 The modules view

- Each module is a node labelled with its name and a second line `N providers`. A global
  module's node is bold and its label reads `Name (global)`.
- Each import is an edge from the importer to the imported module.

### 5.3 Escaping

Display names come from user code, so the renderers escape them:

- DOT: every id and label is a double-quoted string; `\` and `"` are backslash-escaped
  and a newline in a name becomes `\n`. Node ids are the graph's `p0` and `m0` ids,
  never a user string.
- Mermaid: node ids are the graph's ids. Labels are double-quoted, and `"`, `#`, `<`,
  `>` and `&` become the entity codes `#quot;`, `#35;`, `#lt;`, `#gt;` and `#amp;`,
  so a name cannot close the label or inject markup.

A test feeds a token named `a"b#c<script>&\` through both renderers and pins the output.

### 5.4 `implementation` on `NexusGraph`

Every example after the first docs page is interface-first, so most providers are
`provide(TOKEN, { useClass: Impl })`, and a node that shows only `NavCharts` hides which
class the app binds. `NexusGraph` providers gain one field:

```ts
/** A class provider's class name; null for factory, value and alias providers. */
implementation: string | null;
```

`graphOf` reads it from `ProviderView.implementation?.name`. This is an additive field on
a devtools type; core's `ProviderView` already carries the class. The core spec's
section 10.1 listing gains the field.

## 6. SVG and PNG

DOT and Mermaid are strings the renderers write with no dependency. SVG and PNG need a
layout engine, and PNG also needs a rasteriser.

| Option                                           | Install cost                                   | Verdict                                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell out to Graphviz `dot`                      | a system package, per machine and per CI image | Rejected as a code path. The CLI would depend on a binary npm cannot install, and on its version. Documented as a pipe: `-f dot \| dot -Tsvg`. |
| `@viz-js/viz` (Graphviz compiled to WebAssembly) | one package, no dependencies, 5.0 MB unpacked  | Chosen for SVG. Same layout as Graphviz, installs everywhere npm runs, and reads the DOT that `toDot` writes.                                  |
| elkjs or dagre plus an SVG writer of our own     | 8.0 MB (elkjs) or 0.8 MB plus lodash (dagre)   | Rejected. NexusDI would own a second renderer and its SVG output, next to the DOT renderer it already owns.                                    |
| `@mermaid-js/mermaid-cli`                        | Puppeteer and a headless Chromium              | Rejected. Hundreds of MB for one picture.                                                                                                      |
| `@resvg/resvg-js` (prebuilt binary per platform) | 3.5 MB for the platform's binary package       | Chosen for PNG. It rasterises the SVG from `@viz-js/viz` with the system's fonts.                                                              |
| `@resvg/resvg-wasm`                              | 2.5 MB                                         | Rejected. It loads no system fonts, so every label would need a bundled font file.                                                             |

So `svg` renders `toDot(graph)` with `@viz-js/viz` (`instance().renderString(dot, { format: 'svg' })`),
and `png` rasterises that SVG with `@resvg/resvg-js` at 2x zoom. Both are optional peers of
`@nexusdi/cli`, loaded with a dynamic `import()` only for the format that needs them.
A missing one exits 3 with its install line:

```
nexusdi: --format svg needs @viz-js/viz.
  Install it: npm i -D @viz-js/viz
```

Writing PNG bytes to a terminal exits 2 and asks for `--out`.

Weight against P6: core gains 0 bytes, `@nexusdi/devtools` gains the two renderers
(pure string code, tree-shaken out of any app that does not call them), and
`@nexusdi/cli` has zero dependencies. A user who wants text output installs one package
of about 20 KB; the 5 MB and 3.5 MB peers land only in projects that ask for images.

## 7. Tests

- `@nexusdi/devtools`: golden-string tests for `toDot` and `toMermaid` in both views over
  a fixture that covers every kind, lifetime, edge kind, a global module, an exported
  provider, `eager: false` and a class whose name differs from its token; the escaping
  test of section 5.3; the `implementation` field in `graph()` and `inspect()`.
- `@nexusdi/cli`, unit: argument parsing, format selection, the `path#export` parser,
  the `.json` graph shape check, and the exit code for each failure of section 3.3.
- `@nexusdi/cli`, process tests that run the built bin with `node` on fixtures under
  `libs/cli/test-fixtures`: a JS entry, a TypeScript entry through tsx (with a `.js`
  specifier to a `.ts` file and a `@nexusdi/decorators` class), a TypeScript entry through
  type stripping with tsx hidden, an invalid graph (exit 1 and the `@nexusdi/errors`
  text), an entry that starts a server (the CLI still exits), `--load`, `--plugins`, SVG
  and PNG (the PNG signature bytes and the SVG root element).
- `scripts/verify-packaging.mjs`: installs the packed `@nexusdi/cli` with core and
  devtools into the throwaway project and runs `npx nexusdi graph` on a JS entry there,
  which proves the bin, the shebang and the resolve-from-project rule as published.

## 8. Out of scope

- A partial graph for an invalid app. `inspect()` throws, and the CLI prints the
  `@nexusdi/errors` text, which names the module, the token and the fix. The
  CLI would need new devtools API to draw the unfinished view of a failed compile, and
  that view shows edges whose meaning depends on which pass stopped (ruling 7).
- A `nexusdi check` command. `nexusdi graph` already exits 1 on an invalid graph, and a
  test that calls `Nexus.check` stays the documented CI gate (core spec section 3.5).
- Filters (`--module`, `--focus <token>`) and a watch mode. They come when a user with a
  large graph asks.
- A web viewer. The docs playground renders `NexusGraph` already.
- Reading a graph from a running process. A `.json` entry covers it: the app writes
  `graph(ship)` where it chooses to.

## 9. Rulings

An architect draft proposed the design; a tech lead review challenged each point against
the pillars, users first, bundle cost and developer experience, and made the call. No
subagent dispatch tool was available in the session that wrote this spec, so both passes
ran in that session and are recorded here in the same form.

1. Placement. Architect: bin in a new `@nexusdi/cli`, renderers in the same package. Tech
   lead: renderers move to `@nexusdi/devtools`, because the playground and a live app's
   debug endpoint render `graph(ship)` in environments with no CLI and no `node:`.
   The CLI stays a separate package for the `node:` rule and its optional peers.
   Final: section 2. Owner decision (new package, new devtools exports).
2. Devtools as a peer. Architect: `dependencies: { "@nexusdi/devtools": "0.4.0" }`. Tech
   lead: a dependency gives an `npx` or global run its own copy of core, which rejects
   the user's modules. Peer plus resolve-from-project. Final: section 4.3.
3. TypeScript loading. Architect: Node's type stripping only, zero dependencies. Tech
   lead: stripping cannot follow a `.js` specifier to a `.ts` file, which is the import
   style nodenext projects use, and cannot lower decorators; most real projects would
   fail. tsx first when installed, stripping as the fallback, one install line when both
   fail. An `--import <loader>` flag was proposed and cut: a user with another loader
   starts the bin under `node --import`, and a flag would duplicate that. Final: section
   4.2.
4. `tsImport` or `register`. Tech lead: `register()`, because `tsImport()` namespaces the
   module URLs and loads a second core. Final: section 4.2, pinned by a test.
5. Layout engine. Architect: shell out to Graphviz when on `PATH`, `@viz-js/viz` as a
   fallback. Tech lead: two code paths for one output, and a system binary whose version
   the CLI cannot pin. One path, `@viz-js/viz`, as an optional peer; Graphviz users pipe
   `-f dot`. PNG through `@resvg/resvg-js`, because the WASM build has no system fonts.
   Final: section 6. Owner decision (third-party optional peers, a first for the package set).
6. Default format. Architect: `dot`. Tech lead: `mermaid`, because it renders on GitHub
   and the docs with nothing installed. Final: section 3.
7. Partial graphs. Architect: a `--partial` flag and a new `tryInspect()` export returning
   the incomplete view with the error. Tech lead: cut. It adds public API for a picture
   whose edges mean different things depending on the failing pass, and the error text
   already names the fix. Final: section 8.
8. `implementation` field. Tech lead addition: an interface-first graph that hides the
   bound class fails the user who opens it to find out what is wired. Additive field on
   `NexusGraph`. Final: section 5.4. Owner decision (public type change in devtools).
9. `node:` rule. The core spec lets `@nexusdi/node` alone import `node:` modules. The
   repo-check gains `libs/cli/src` as a second exemption. Owner decision (a rule in the
   core spec changes).
10. Exit codes. Architect: a fifth code for internal errors. Tech lead: four codes; CI
    needs "invalid graph" to be exactly 1, and an internal error prints its stack under
    code 2. Final: section 3.3.
11. Core input errors outside a `BlueprintError`. Found in the final review: an object
    root with keys other than `providers`, `imports` and `exports` makes `Nexus.check`
    throw `NEXUS_INVALID_MODULE` directly, and the CLI printed it as an unexpected error
    with a stack. Architect: exit 1 for every `NEXUS_` error, so "core refused it" is
    one code. Tech lead: exit 1 means the graph was checked and is invalid, which CI
    keys on; this input never reached the compile, so it is a wrong input, exit 2 with
    core's message and no stack. Final: exit 2, section 3.1.

## 10. Core plugin API gaps

None. `inspect()` runs `Nexus.check` with a `compile.check` hook that captures the
`BlueprintView`, and `ProviderView.implementation` supplies the new field. Core spec
section 3.10.8's row for #18 stands.
