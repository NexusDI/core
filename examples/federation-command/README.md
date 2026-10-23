# @nexusdi/federation-command

A remote of the federation demo: the `command` station, written with
`@nexusdi/decorators`. It exposes `./section` with the `@Module` class `Command` and the
component `CommandDeck`. `Command` binds `BRIDGE` to `Bridge`, which reads the contract's
`NAV_CHARTS` through `@Inject(NAV_CHARTS) accessor charts`. The shell imports nothing from
`@nexusdi/decorators`, so `CommandDeck` shows `course to Kepler-442b, heading 42` only
when the shell's core reads the metadata this bundle wrote.

`Command` also binds `HELM_ORDERS` to `HelmOrders`, an `@Injectable({ deps: [COMMAND_LINK] })`
class that sends `helm course` and `helm burn` over the contract's `COMMAND_LINK`. The
deck's `Steer for Kepler-442b` and `Burn at 0.5` buttons send them, and its status line
shows the receipt text the shell words.

It serves on port 4302, and the shell (`examples/federation-shell`) loads it on
`/command`.

rspack's builtin swc loader and vitest's `unplugin-swc` both compile standard decorators
with the settings in `swc.decorators.ts`: `jsc.parser.decorators: true` and
`jsc.transform.decoratorVersion: '2023-11'`. `Command` sets `name: 'Command'`, so the
default production minifier renames the class and `graph(ship)` still lists the module as
`Command`.

## Commands

```sh
npx nx serve @nexusdi/federation-command
npx nx build @nexusdi/federation-command
npx nx test @nexusdi/federation-command
```
