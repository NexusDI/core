# @nexusdi/federation-shell

The host of the federation demo: the Meridian shell. It holds the container `ship`, whose
root `Meridian` imports `Tactical`, the module that provides the contract's `NAV_CHARTS`,
`STATION_TELEMETRY` and `COMMAND_LINK`. Four stations join the ship at runtime as sections,
each a remote built and served on its own. A remote cannot import `Tactical`, so each
section loads with `{ imports: [Tactical] }`, a grant that lets the station see the
module's exports:

- `/charts` loads `cartography` (`examples/federation-cartography`) and renders its
  `CartographyPanel`.
- `/command` loads `command` (`examples/federation-command`), whose classes use
  decorators, and renders its `CommandPanel`, which sends helm orders.
- `/engineering` loads `engineering` (`examples/federation-engineering`) and renders its
  `EngineeringPanel`.
- `/life-support` loads `life-support` (`examples/federation-life-support`) and renders
  its `LifeSupportPanel`.

At startup the shell reads `/remotes.json`, a list of `{ name, entry }`, and registers it
with the Module Federation runtime. The shell build emits `remotes.json` from the station table (`src/stations.ts`), with the development ports. A
station that fails to load renders `SectionFailed` with the `SectionError` code, then the code and message of the load error in its `cause`, and
its retry button loads the section again. The contract lives in
`examples/federation-contracts`, which the shell owns.

`STATION_TELEMETRY` reads bridge-api's `GET /telemetry` stream, and `COMMAND_LINK` posts to
its `POST /commands`. The shell reads bridge-api's address from `/bridge.json`,
`{ "url": "..." }`, the first time a station asks for either, so startup fetches nothing.
`public/bridge.json` names `http://localhost:3000/`, bridge-api's dev port, and bridge-api's
Hono entry answers the shell's origins, `http://localhost:4300` and `http://127.0.0.1:4300`,
with CORS headers. A `url` in `/bridge.json` without a trailing slash gets one, so its path
stays in front of `telemetry` and `commands`.

The telemetry stream does not reconnect after bridge-api restarts. A panel shows
"Telemetry offline" until the crew leaves the route and opens it again. When
`/bridge.json` is missing or malformed, the panels show "offline" or "The bridge
is unreachable". A relative `url` gives the same panels. The shell logs the
cause with `console.error`.

The shell lists `@nexusdi/bridge-api` as a devDependency because the e2e servers start its
Hono entry. Nx reads the devDependency as a project edge, so `nx affected` marks the shell
and runs its tests, builds and e2e whenever bridge-api changes. Nx's TypeScript sync adds
`../bridge-api/tsconfig.lib.json` to `tsconfig.app.json` for the same edge, so the shell's
type check builds bridge-api first.

The ports: the shell on 4300, `cartography` on 4301, `command` on 4302, `engineering` on
4305 and `life-support` on 4306.

## Commands

The first command serves the four remotes in development, and each remote's `serve`
starts the shell's, so five dev servers run side by side. The second starts bridge-api,
which the stations read and command.

```sh
npx nx run-many -t serve --projects=@nexusdi/federation-cartography,@nexusdi/federation-command,@nexusdi/federation-engineering,@nexusdi/federation-life-support
npx nx dev @nexusdi/bridge-api
npx nx build @nexusdi/federation-shell           # production build in dist/main
npx nx build-e2e @nexusdi/federation-shell       # production build with devtools(), in dist/e2e
npx nx test @nexusdi/federation-shell
npx nx e2e @nexusdi/federation-shell             # every build, then Playwright in Chromium
npx nx e2e-growth @nexusdi/federation-shell      # the growth cases against a manual bridge-api
```

The e2e suite runs three shell instances, on 4300, 4310 and 4320, one per remote list in
`e2e/remotes`: the main remotes, the drift build of `cartography` on 4303 and its
unshared build on 4304. `SHELL_PORT=4400` moves the three shells on a machine where 4300
is taken.

The `e2e-growth` target runs the cases under `e2e/growth` through
`playwright.e2e-growth.config.mts`, one each for `engineering`, `command` and
`life-support`, in that order, since they share one ship. One shell on `SHELL_PORT + 30`
(4330 by default) loads the three remotes on 4332, 4335 and 4336, and bridge-api's Hono
entry runs a manual ship on seed 7 on 4331 and answers that shell's origin. Each case
reads the ship's tick from `GET /sim` and advances it with `POST /sim/advance`.
