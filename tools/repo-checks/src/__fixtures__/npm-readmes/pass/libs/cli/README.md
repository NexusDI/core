# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.

`nexusdi graph` reads the file that defines your [NexusDI](https://www.npmjs.com/package/@nexusdi/core) root module, checks the graph and builds nothing.

- No constructor runs.
- A `.ts` entry needs no build step.
- Exits 1 on an invalid graph, for CI.
- Draws the providers view or the modules view.

<img src="https://raw.githubusercontent.com/NexusDI/core/release/0.4/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge imports Engineering" width="720">

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

SVG needs `@viz-js/viz`, PNG also `@resvg/resvg-js`.

## Usage

```bash
npx nexusdi graph src/app.module.ts#AppModule
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
npx nexusdi graph src/app.module.ts#AppModule --view modules
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

The last line exits 1 when the graph is invalid, so a CI job can run it.

## Options

| Option | Meaning |
| --- | --- |
| `-f, --format <format>` | `mermaid`, `dot`, `json`, `svg` or `png`. |
| `-o, --out <file>` | Write to a file. Default: stdout. |

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/cli/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
