# @nexusdi/federation-shell

The host of the federation demo: the Meridian shell. It holds the container `ship`, whose
root `Meridian` imports `Tactical`, the global module that provides the contract's
`NAV_CHARTS`. Two stations join the ship at runtime as sections, each a remote built and
served on its own:

- `/charts` loads `cartography` (`examples/federation-cartography`) and renders its
  `StarMap`.
- `/command` loads `command` (`examples/federation-command`), whose classes use
  decorators, and renders its `CommandDeck`.

At startup the shell reads `/remotes.json`, a list of `{ name, entry }`, and registers it
with the Module Federation runtime. `public/remotes.json` holds the development ports. A
station that fails to load renders `SectionFailed` with the error code and message, and
its retry button loads the section again. The contract lives in
`examples/federation-contracts`, which the shell owns.

The ports: the shell on 4300, `cartography` on 4301 and `command` on 4302.

## Commands

The first command serves both remotes in development, and each remote's `serve` starts
the shell's.

```sh
npx nx run-many -t serve --projects=@nexusdi/federation-cartography,@nexusdi/federation-command
npx nx build @nexusdi/federation-shell           # production build in dist/main
npx nx build-e2e @nexusdi/federation-shell       # production build with devtools(), in dist/e2e
npx nx test @nexusdi/federation-shell
npx nx e2e @nexusdi/federation-shell             # every build, then Playwright in Chromium
```

The e2e suite runs three shell instances, on 4300, 4310 and 4320, one per remote list in
`e2e/remotes`: the main remotes, the drift build of `cartography` on 4303 and its
unshared build on 4304. `SHELL_PORT=4400` moves the three shells on a machine where 4300
is taken.
