# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli) [![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.

`nexusdi graph` reads the file that defines your [NexusDI](https://www.npmjs.com/package/@nexusdi/core) root module and checks the graph without building it. Put the picture in a pull request, and let CI fail when a provider goes missing.

- No constructor runs: `Nexus.check` compiles the graph only.
- A `.ts` entry loads through tsx or Node's type stripping.
- Exits 1 on an invalid graph, so CI can gate on it.
- Draws the providers view or the modules view.

<img src="https://raw.githubusercontent.com/NexusDI/core/release/0.4/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge provides Helm and ShipLog; Engineering provides ShipComputer, Reactor and the async NavCharts factory." width="720">

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

SVG needs `@viz-js/viz`, and PNG needs `@resvg/resvg-js` as well.

## Usage

```bash
npx nexusdi graph src/app.module.ts#AppModule
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
npx nexusdi graph src/app.module.ts#AppModule --view modules
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

The last line exits 1 when the graph is invalid, so a CI job can run it.

## Options

| Option                    | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `-f, --format <format>`   | `mermaid`, `dot`, `json`, `svg` or `png`. Default: from `--out`'s extension, else `mermaid`. |
| `-o, --out <file>`        | Write to a file. Default: stdout.                                                            |
| `--view <view>`           | `providers` (grouped by module) or `modules` (the import graph).                             |
| `--load <path#export>`    | A module to compile after the root, as `load()` would. Repeatable.                           |
| `--plugins <path#export>` | An exported array of plugins, such as `[federation()]`.                                      |

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/cli/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
