# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Audit and visualize your application architecture from the terminal.**

As dependency graphs grow, it becomes difficult to detect circular dependencies, unintended couplings, or missing bindings without running the entire application. `@nexusdi/cli` solves this by extracting your dependency tree into a visual or structured format without instantiating your providers.

```bash
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
```

## Key Features

The CLI imports your entry file and analyzes the graph without instantiating any provider. Keep the `Nexus.create` call that starts your app out of that file, because its top-level code runs. It supports multiple output formats including Mermaid, DOT, JSON, SVG, and PNG. The tool returns exit code `1` on invalid graphs, allowing you to block broken wiring in CI/CD pipelines.

## Options

The CLI provides several flags to control the analysis and output.

| Flag           | Purpose                                                                                                                                                                          | Example                            |
| :------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| `-f, --format` | Choose output format (`mermaid`, `dot`, `json`, `svg`, `png`). Default: from `--out`'s extension, else `mermaid`. SVG needs `@viz-js/viz`, and PNG also needs `@resvg/resvg-js`. | `-f svg`                           |
| `-o, --out`    | Save the output to a file                                                                                                                                                        | `-o graph.svg`                     |
| `--view`       | Switch between `providers` (default) or `modules` view                                                                                                                           | `--view modules`                   |
| `--load`       | Simulate loading a module at runtime. Repeatable.                                                                                                                                | `--load src/feature.ts#Feature`    |
| `--plugins`    | Pass the exported array of plugins your app gives `Nexus.create`                                                                                                                 | `--plugins src/plugins.ts#plugins` |

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

You can target specific modules to generate diagrams or export data.

```bash
npx nexusdi graph src/app.module.ts#AppModule
npx nexusdi graph src/app.module.ts#AppModule -o graph.svg
npx nexusdi graph src/app.module.ts#AppModule --view modules
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

A `.ts` entry on Node before 22.18 needs `tsx` installed. Every command exits 1 when the graph is invalid. Add the last one to your CI pipeline to prevent broken wiring from being merged.

## Documentation

- [Graph CLI Guide](https://nexus.js.org/next/graph-cli/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/cli/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
