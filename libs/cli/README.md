# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Visualize your dependency graph from the terminal.**

The `@nexusdi/cli` tool allows you to export your application's dependency tree as a visual diagram or a structured JSON file. This is invaluable for auditing your architecture, detecting unintended dependencies, and documenting your system.

## Core Capabilities

- **Zero-Execution Analysis:** The CLI uses `Nexus.check` to analyze your graph without actually instantiating any classes. No constructors run, and no side effects occur.
- **Multiple Formats:** Export your graph as Mermaid, DOT, JSON, SVG, or PNG.
- **CI-Ready:** The command exits with code `1` if the graph is invalid, making it a perfect gate for your CI/CD pipeline.

## Installation

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

To draw the graph of your root module:

```bash
npx nexusdi graph src/app.module.ts#AppModule
```

### Common Options

| Flag           | Purpose                                           | Example                         |
| :------------- | :------------------------------------------------ | :------------------------------ |
| `-f, --format` | Choose output format (`svg`, `png`, `json`, etc.) | `-f svg`                        |
| `-o, --out`    | Save the output to a file                         | `-o graph.svg`                  |
| `--view`       | Switch between `providers` or `modules` view      | `--view modules`                |
| `--load`       | Simulate loading a module at runtime              | `--load src/feature.ts#Feature` |

## Integration Example

Add this to your CI pipeline to prevent broken wiring from being merged:

```bash
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

## Documentation

- [Graph CLI Guide](https://nexus.js.org/next/graph-cli/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
