# @nexusdi/cli

`nexusdi graph` draws a NexusDI app's dependency graph from its root module file. It checks the graph with `Nexus.check` and builds nothing, so no constructor runs.

```bash
npm install -D @nexusdi/cli @nexusdi/devtools
```

`@nexusdi/cli`, `@nexusdi/devtools` and `@nexusdi/core` must share one version.

## Graph

```bash
npx nexusdi graph src/meridian.module.ts#Meridian
npx nexusdi graph src/meridian.module.ts#Meridian -o docs/graph.svg
npx nexusdi graph src/meridian.module.ts#Meridian --view modules -f dot
npx nexusdi graph src/meridian.module.ts#Meridian --load src/science.module.ts#Science
```

The entry is `path#export`, or `path` for the default export (`path#default` names it too). A `#` inside the path stays part of the path, as in `d#x/app.module.ts`. Point it at the file that defines the root module; `nexusdi` imports that file, so a file that starts the app starts it. A `.json` file written with `JSON.stringify(graph(ship))` from a running app works as an entry too.

| Option                    | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `-f, --format <format>`   | `mermaid`, `dot`, `json`, `svg` or `png`. Default: from `--out`'s extension, else `mermaid`. |
| `-o, --out <file>`        | Write to a file. Default: stdout.                                                            |
| `--view <view>`           | `providers` (grouped by module) or `modules` (the import graph).                             |
| `--load <path#export>`    | A module to compile after the root, as `load()` would. Repeatable.                           |
| `--plugins <path#export>` | An exported array of plugins, such as `[federation()]`.                                      |

## TypeScript

A `.ts` entry needs no build and no flags. When the project has `tsx` installed, `nexusdi` loads the entry through it, with the project's `tsconfig.json`. Without tsx, Node 22.18 and later load TypeScript that only needs its types removed and whose imports name `.ts` files. Anything else asks for `npm i -D tsx`.

## SVG and PNG

Mermaid, DOT and JSON need nothing else. SVG needs `@viz-js/viz` (Graphviz as WebAssembly), and PNG needs `@resvg/resvg-js` as well:

```bash
npm install -D @viz-js/viz @resvg/resvg-js
```

With Graphviz installed, `nexusdi graph src/meridian.module.ts -f dot | dot -Tpng > graph.png` needs neither.

## Exit codes

| Code | Meaning                                                                             |
| ---- | ----------------------------------------------------------------------------------- |
| 0    | The graph was written.                                                              |
| 1    | The graph is invalid. stderr holds the `BlueprintError` text.                       |
| 2    | The command or its input is wrong.                                                  |
| 3    | Something is missing: tsx, `@nexusdi/devtools`, `@viz-js/viz` or `@resvg/resvg-js`. |

A CI job can run `nexusdi graph src/meridian.module.ts -f json -o graph.json`: it fails exactly when the graph is invalid.
