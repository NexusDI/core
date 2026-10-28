# @nexusdi/federation-command

A remote of the federation demo: the `command` station, written with
`@nexusdi/decorators`. It exposes `./section` with the `@Module` class `CommandStation` and
the component `CommandPanel`. `CommandStation` binds `COURSE_PLOTTER` to `CoursePlotter`,
which reads the contract's `NAV_CHARTS` through `@Inject(NAV_CHARTS) accessor charts`. The
shell imports nothing from `@nexusdi/decorators`, so `CommandPanel` shows
`course to Kepler-442b, heading 42` only when the shell's core reads the metadata this
bundle wrote.

`CommandStation` also binds `HELM_ORDERS` to `HelmOrders`, an
`@Injectable({ deps: [COMMAND_LINK] })` class that sends `helm course` and `helm burn` over
the contract's `COMMAND_LINK`. The panel's `Steer for Kepler-442b` and `Burn at 0.5`
buttons send them, and its status line shows the receipt text the shell words.

It serves on port 4302, and the shell (`examples/federation-shell`) loads it on
`/command`.

rspack's builtin swc loader and vitest's `unplugin-swc` both compile standard decorators
with the settings in `swc.decorators.ts`: `jsc.parser.decorators: true` and
`jsc.transform.decoratorVersion: '2023-11'`. `CommandStation` sets
`name: 'CommandStation'`, so the default production minifier renames the class and
`graph(ship)` still lists the module as `CommandStation`.

## Commands

```sh
npx nx serve @nexusdi/federation-command
npx nx build @nexusdi/federation-command
npx nx test @nexusdi/federation-command
```
