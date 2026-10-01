# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.

`nexusdi graph` reads the file that defines your [NexusDI](https://www.npmjs.com/package/@nexusdi/core) root module and checks the graph without building it. Put the picture in a pull request, and let CI fail when a provider goes missing.

- No constructor runs: `Nexus.check` compiles the graph only.
- A `.ts` entry loads through tsx or Node's type stripping.
- Exits 1 on an invalid graph, so CI can gate on it.
- Draws the providers view or the modules view.

<img src="https://raw.githubusercontent.com/NexusDI/core/refs/tags/@nexusdi/core@0.4.0-rc.0/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: in Bridge, Helm depends on ShipLog and on ShipComputer, which Engineering exports; ShipComputer depends on Reactor and the NavCharts factory." width="720">

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

SVG needs `@viz-js/viz`, PNG also needs `@resvg/resvg-js`, and a `.ts` entry on Node before 22.18 needs `tsx`.

## Usage

```bash
npx nexusdi graph src/app.module.ts#AppModule
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
npx nexusdi graph src/app.module.ts#AppModule --view modules
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

Every command exits 1 when the graph is invalid. The last one also saves the graph as JSON for the CI job to keep.

## Options

| Option                    | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `-f, --format <format>`   | `mermaid`, `dot`, `json`, `svg` or `png`. Default: from `--out`'s extension, else `mermaid`. |
| `-o, --out <file>`        | Write to a file. Default: stdout.                                                            |
| `--view <view>`           | `providers` (grouped by module) or `modules` (the import graph). Default: `providers`.       |
| `--load <path#export>`    | A module to compile after the root, as `load()` would. Repeatable.                           |
| `--plugins <path#export>` | An exported array of plugins, such as `[federation()]`.                                      |

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/cli/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
