# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Visualize your dependency graph from the terminal.**

The `@nexusdi/cli` tool allows you to export your application's dependency tree as a visual diagram or a structured JSON file. This is invaluable for auditing your architecture, detecting unintended dependencies, and documenting your system.

## Core Capabilities

- **Zero-Execution Analysis:** The CLI imports your entry file and analyzes the graph without instantiating any provider. Keep the `Nexus.create` call that starts your app out of that file, because its top-level code runs.
- **Multiple Formats:** Export your graph as Mermaid, DOT, JSON, SVG, or PNG.
- **CI-Ready:** The command exits with code `1` if the graph is invalid, making it a perfect gate for your CI/CD pipeline.

## Installation

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

To draw the graph of your root module, save it as SVG, or draw the module import graph:

```bash
npx nexusdi graph src/app.module.ts#AppModule
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
npx nexusdi graph src/app.module.ts#AppModule --view modules
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

Every command exits 1 when the graph is invalid. Add the last one to your CI pipeline to prevent broken wiring from being merged.

## Options

| Flag           | Purpose                                                                                                                                                                          | Example                            |
| :------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| `-f, --format` | Choose output format (`mermaid`, `dot`, `json`, `svg`, `png`). Default: from `--out`'s extension, else `mermaid`. SVG needs `@viz-js/viz`, and PNG also needs `@resvg/resvg-js`. | `-f svg`                           |
| `-o, --out`    | Save the output to a file                                                                                                                                                        | `-o graph.svg`                     |
| `--view`       | Switch between `providers` (default) or `modules` view                                                                                                                           | `--view modules`                   |
| `--load`       | Simulate loading a module at runtime. Repeatable.                                                                                                                                | `--load src/feature.ts#Feature`    |
| `--plugins`    | Pass the exported array of plugins your app gives `Nexus.create`                                                                                                                 | `--plugins src/plugins.ts#plugins` |

## Documentation

- [Graph CLI Guide](https://nexus.js.org/next/graph-cli/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
