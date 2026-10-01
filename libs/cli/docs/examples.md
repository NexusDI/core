# CLI examples

## Modules loaded later

`--load` compiles a module after the root, as `load()` does at runtime.

```bash
npx nexusdi graph src/meridian.module.ts#Meridian --load src/science.module.ts#Science
```

## A graph saved by a running app

A `.json` file written with `JSON.stringify(graph(ship))` works as an entry.

```bash
npx nexusdi graph graph.json -f svg -o graph.svg
```

## Graphviz without the WebAssembly packages

With Graphviz installed, DOT output pipes into `dot`.

```bash
npx nexusdi graph src/meridian.module.ts#Meridian -f dot | dot -Tpng > graph.png
```
