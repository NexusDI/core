# size

The fixture app the size report bundles. It is a measuring rig. Nothing in it is a pattern to copy.

## What it measures

`scripts/size-report.mjs` bundles each fixture in `src/` with `esbuild --bundle --minify --format=esm` and gzips the result at level 9. The figure for a package is its fixture minus the `core` fixture, so the number is what that package adds on top of core. A `<dir>-text.ts` fixture reports as `<dir>/text` and a `<dir>-<feature>.ts` fixture as `<dir>+<feature>`, both minus core. The size workflow runs the script on the merge base and on the head, and fails a pull request that grows core by more than `coreGrowthPercent` in `size-report.json` unless the description has a `## Size` section. `consolidation.json` holds the core size after each kept step; `--record <step>` appends one.

```sh
node scripts/size-report.mjs
```

## Why the tokens are classes

The workflow measures the merge base with the head's fixture, so the fixtures use only API that the merge base also has, including old revisions. That is why `app.ts` binds `UserService` as a class, `core.ts` resolves it with `app.get(UserService)`, and `react.ts` calls `useService(UserService)`. Most fixtures resolve it the way `core.ts` does. A fixture that adopted a newer API would not build on the merge base.

A user writes the interface first. The service is a `Token<IFoo>`, the module binds it with `useClass`, and consumers declare the token in `deps`:

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IUserDirectory {
  find(id: string): string;
}
class FakeUserDirectory implements IUserDirectory {
  find = (id: string) => `user ${id}`;
}
const USER_DIRECTORY = new Token<IUserDirectory>('UserDirectory');

const App = defineModule({
  name: 'App',
  providers: [provide(USER_DIRECTORY, { useClass: FakeUserDirectory })],
});

await using app = await Nexus.create(App);
app.get(USER_DIRECTORY).find('7'); // -> 'user 7'
```

## Changing a fixture

Edit a fixture only to track API that the merge base also has. A new feature gets its own `<dir>-<feature>.ts` file. After a change, run the script and read the figures it prints as JSON.
