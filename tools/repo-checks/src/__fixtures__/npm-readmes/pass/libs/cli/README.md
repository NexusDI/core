# @nexusdi/cli

[![npm](https://img.shields.io/npm/v/@nexusdi/cli/next)](https://www.npmjs.com/package/@nexusdi/cli)
[![license](https://img.shields.io/npm/l/@nexusdi/cli)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Visualize your dependency graph from the terminal.**

`nexusdi graph` reads the file that defines your root module, checks the graph and builds nothing.

<img src="https://raw.githubusercontent.com/NexusDI/core/refs/tags/@nexusdi/core@0.4.0-rc.1/libs/devtools/assets/graph.svg" alt="NexusDI graph of the Meridian app: Bridge imports Engineering" width="720">

## Core Capabilities

- **Zero-Execution Analysis:** No constructor runs.
- **CI-Ready:** Exits 1 on an invalid graph.

## Installation

```bash
npm install -D @nexusdi/cli@next @nexusdi/devtools@next @nexusdi/core@next
```

## Usage

```bash
npx nexusdi graph src/app.module.ts#AppModule
```

## Integration Example

```bash
npx nexusdi graph src/app.module.ts#AppModule -f json -o graph.json
```

## Documentation

- [Graph CLI Guide](https://nexus.js.org/next/graph-cli/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/cli/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
