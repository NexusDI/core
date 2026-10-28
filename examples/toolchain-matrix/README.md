# toolchain-matrix

A gate that builds and runs the packed `@nexusdi/core` under every pinned TypeScript toolchain. It is a CI check. Nothing in it is a pattern to copy.

## What it gates

`scripts/run-matrix.mjs` packs `core`, `decorators`, `errors` and `devtools`, installs the tarballs and every toolchain in `toolchains.json` into a throwaway directory, and builds each variant under `src/` with each toolchain. The `plain` variant uses no decorators; the `decorated` variant does, and is skipped (`unsupported`) for a toolchain that has none. It runs the output and compares what it prints with `golden.json`.

The cells are the toolchain times the variant. The run fails when a cell differs from `golden.json`, and with `--check` it also fails when the fresh results differ from the committed `toolchain-matrix.json`. The docs site and the launch post read that file, so it states what CI last proved.

## What the target prints

```sh
npx nx run @nexusdi/toolchain-matrix:matrix --output-style=stream
```

Without `--output-style=stream`, Nx hides the output of a task that passes, with `nx run` and with `nx run-many` alike. You then see only Nx's own success line. With the flag, the script prints the packages it packs and the pins it installs, then one line per cell with the result, the toolchain, its version and the variant:

```text
  pass        tsc 6.0.3 decorated
  pass        vite 8.3.0 plain
```

It ends with `Toolchain matrix passed.` or `Toolchain matrix FAILED`. A cell with no support, such as `decorated` under Vite 8.3, prints no line and is recorded as `unsupported` in `toolchain-matrix.json`. A cell that differs from the golden prints the output it got on stderr, and a cell that does not build prints the tool's own error. A failing task shows its output without the flag. The run takes about 25 seconds.

## Why the tokens are classes

The scenario in `src/*/meridian.ts` wires some classes straight to classes, because it checks that decorators and the plain API produce the same graph under each toolchain, and does not model an application. A user writes the interface first. The service is a `Token<IFoo>`, the module binds it with `useClass`, and consumers declare the token in `deps`:

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IChartPlotter {
  plot(to: string): string;
}
class FakeChartPlotter implements IChartPlotter {
  plot = (to: string) => `course to ${to}`;
}
const CHART_PLOTTER = new Token<IChartPlotter>('ChartPlotter');

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(CHART_PLOTTER, { useClass: FakeChartPlotter })],
});

await using ship = await Nexus.create(Navigation);
ship.get(CHART_PLOTTER).plot('Kepler-442b'); // -> 'course to Kepler-442b'
```
