# NexusDI 0.4 framework integrations and edge runtimes Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: Publish `@nexusdi/express`, `@nexusdi/vitest`, `@nexusdi/fastify`, `@nexusdi/hono`, `@nexusdi/react-router`, `@nexusdi/react` and `@nexusdi/next` in 0.4.0-rc.2 (Next may follow in rc.3), each running in CI through a demo app, with Hono tested on Node, workerd, Deno, Bun and Vercel's edge-runtime VM.

Architecture: Each adapter is its own package under `libs/<name>`, built with tsc like `libs/node`. The server adapters share two byte-identical files under `src/internal/` (`request-scope.ts`, `dispose-with-body.ts`), held together by a copies check under P4's named exception. `examples/bridge-api` runs one Meridian module graph behind Hono, Express, Fastify and a Workers entry; `examples/react-ssr` moves to React Router 8, `@nexusdi/react-router` and `@nexusdi/react`; `examples/next-bridge` serves the bridge API through Next route handlers and a server action.

Tech Stack: Node 24.20 (CI floor 22.12), TypeScript 6.0.3, Vitest 4.1.9, Nx 23.1.1, hono 4.13.13, @hono/node-server 2.1.5, express 5.3.0, fastify 5.12.7, fastify-plugin 6.0.1, react-router 8.4.0 (7.18.4 in the 7.x leg), react 19.3.0, next 16.4.1, wrangler 4.151.0, @cloudflare/vitest-pool-workers 0.23.0, @edge-runtime/vm (latest at install, pinned exactly), Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-09-23-integrations-design.md` (revision 3, with the owner's answers of 2026-10-15 in section 20). React: `specs/2026-09-24-react-design.md` on `origin/spec/react` at `26cb2a26` (status "decided"). Extension principle: `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`. Release: `RELEASING.md` and the `nexusdi-release` skill. Docs pages: the `docs-page` skill.

## Global Constraints

- Work on a branch cut from `origin/release/0.4`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`.
- Never use `--no-verify`, never force-push a shared branch, never merge to `main`, never run `npm publish`, `npm dist-tag` or `bootstrap.sh`, and dispatch `release.yml` only with `dry-run=true` (the `nexusdi-release` skill). Steps marked OWNER-ONLY are the owner's.
- Commit messages follow conventional commits with a scope from `commitlint.config.js` and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit prose follows the writing rules of the `nexusdi-ways-of-working` skill.
- New scopes, each added by the task that creates the project: `express`, `vitest`, `fastify`, `hono`, `react-router`, `react`, `next`, `bridge-api`, `next-bridge`. `react-ssr` commits use the existing `examples` scope.
- Each package is generated with `npx nx g @nx/js:library libs/<name> --name=@nexusdi/<name> --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive`, then aligned with `libs/node`: same `package.json` fields (`type`, `sideEffects`, `engines.node: ">=22.12"`, `exports` with `@nexusdi/source` first, `files`, `publishConfig`), same `project.json` (lint `--max-warnings=0`, test `dependsOn: ["^build", "build"]`, `stage-publish: {}`), same `vite.config.ts` shape (with `docExamples()`), and `docs/examples.md`. Run `git diff nx.json` after the generator and restore any lost comment (the `generator-collateral` check guards it).
- Version on disk for every new package: `0.4.0-rc.1`, with `"@nexusdi/core": "0.4.0-rc.1"` (exact) in `peerDependencies`. `package-versions.test.ts` holds the core peer.
- Every new package joins `.fallowrc.jsonc` `publicPackages` and `tools/repo-checks/src/npm-readmes-data.ts` `PACKAGES` in the task that creates it.
- No `node:` import and no `process` in any adapter's `src` (`core-layers.ts` `nodeViolations` already enforces it). No `eval(` and no `new Function` in `@nexusdi/hono`, `@nexusdi/react-router` and `@nexusdi/next` (Task 8 adds the check).
- One string literal of a core code per server adapter: `isNexusError(error, 'NEXUS_DISPOSED')`, in `request-scope.ts` only (P1 allowlist entry in `owner-vocabulary.test.ts`; Task 17 adds `@nexusdi/next` to it).
- No adapter imports `@nexusdi/node`, `@nexusdi/errors` or `@nexusdi/devtools` at runtime. Their tests list them as dev dependencies.
- Samples, tests and READMEs after "Getting started" are interface-first: `Token<IFoo>`, `provide(TOKEN, { useClass })`, `static deps`, Meridian names from docs spec §7.1 plus the two rows of integrations spec 15.2 (`BridgeApi`, `createBridge`, `GET /course/:to`, `x-mission-id`, `INavCharts`/`NAV_CHARTS`, `IFlightLog`/`FLIGHT_LOG`, `ShuttleFlightLog`, `fakeCharts`, `MemoryFlightLog`, `MISSION`, `Mission = { id: string; target: string }`).
- Prose and comments: plain engineer text, no em dashes, no bold lead-ins in comments or commit prose, never the word "native", never mention reflect-metadata.
- The copied files `request-scope.ts` and `dispose-with-body.ts` never carry the comment "keep them in step with libs/" (`no-copies.ts` refuses it). The copies check is the guard.

## Shared interfaces

Every task that touches the shared files uses these names and types exactly. Task 1 writes `request-scope.ts`; Task 7 writes `dispose-with-body.ts`; later tasks copy them byte for byte.

```ts
// libs/<adapter>/src/internal/request-scope.ts
import type {
  DepsMap,
  LookupOptions,
  ModuleRef,
  Nexus,
  NexusRequest,
  ResolvedDeps,
  Scope,
} from '@nexusdi/core';

export type ContainerSource = Nexus | (() => Promise<Nexus>);

export type LogPhase = 'build' | 'scope' | 'load' | 'validate' | 'dispose';
export interface LogContext {
  readonly adapter: string;
  readonly phase: LogPhase;
  readonly status?: 500 | 503;
}
export type NexusLog = (error: unknown, context: LogContext) => void;

/** Raised around any rejection of the function form's build. Maps to 503. */
export class ContainerBuildError extends Error {
  constructor(options: { cause: unknown });
}

/** Raised by scope() after close(): the request has finished. */
export class RequestFinishedError extends Error {}

/** The error an adapter hands its framework: status, status text as message, the original as cause, no `code`. */
export class NexusHttpError extends Error {
  readonly status: 500 | 503;
  readonly statusCode: 500 | 503;
  readonly expose: false;
  constructor(status: 500 | 503, options: { cause: unknown });
}

export interface RequestScope {
  scope(): Promise<Scope>;
  readonly started: boolean;
}
export interface ClosableRequestScope extends RequestScope {
  close(): Promise<void>;
}

export function containerOf(source: ContainerSource): () => Promise<Nexus>;
export function requestScope(
  container: () => Promise<Nexus>,
  request: () => NexusRequest | undefined | Promise<NexusRequest | undefined>,
): ClosableRequestScope;
/** A RequestScope over a scope the caller owns: scope() returns it, close() disposes nothing. */
export function existingScope(scope: Scope): ClosableRequestScope;

/** 503 for ContainerBuildError and NEXUS_DISPOSED, 500 for any other NexusError, undefined for anything else. */
export function statusOf(error: unknown): 500 | 503 | undefined;
/** Logs once through `log` and returns a NexusHttpError for a mapped error; rethrows anything else unchanged. A ContainerBuildError logs with phase 'build'. */
export function toHttpError(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): NexusHttpError;
/** A validator() failure on a request: a 500 logs each inner error through logEach and returns the NexusHttpError; a 503 goes through toHttpError; an unmapped error comes back unchanged. */
export function validateFailure(
  error: unknown,
  log: NexusLog,
  adapter: string,
): unknown;
/** The default log: code, own enumerable fields and message for a NexusError; phase and error otherwise. A 503 that is not a ContainerBuildError writes console.warn, everything else console.error. */
export function defaultLog(error: unknown, context: LogContext): void;
/** Calls log in a try, and catches a returned promise that rejects; on either failure writes `[adapter] log threw:`, the log's error and the original error with console.error, and returns. */
export function guardLog(log: NexusLog): NexusLog;
/** 'warn' for a 503 that is not a ContainerBuildError, 'error' for everything else. defaultLog and Fastify's req.log default both use it. */
export function logLevel(error: unknown, context: LogContext): 'warn' | 'error';
/** close() at most once; a disposal error is logged with phase 'dispose' and never thrown. */
export function disposer(
  handle: ClosableRequestScope,
  log: NexusLog,
  adapter: string,
): () => Promise<void>;
/** Loads the module, then extends the handle's scope if it has started. */
export function enterSection(
  load: (module: ModuleRef) => Promise<Nexus>,
  module: ModuleRef,
  handle: RequestScope | null | undefined,
): Promise<void>;
/** The request's handle, or the "register <hook> before this route" error. */
export function requireHandle(
  handle: RequestScope | null | undefined,
  adapter: string,
  hook: string,
): RequestScope;
/** statusOf undefined: the error unchanged; otherwise toHttpError for the phase. */
export function mapError(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): unknown;
/** How a request step stops: finished (a RequestFinishedError, logged with phase 'scope'), or a failure already mapped and logged. */
export type Stop = { readonly finished: true } | { readonly failure: unknown };
/** A section's enterSection, as a Stop for the adapter to act on; undefined when the request goes on. */
export function enterFor(step: {
  load: (module: ModuleRef) => Promise<Nexus>;
  section: ModuleRef;
  handle: RequestScope | null | undefined;
  log: NexusLog;
  adapter: string;
}): Promise<Stop | undefined>;
/** inject's request path: the section load, the deps check (validateFailure), then the deps from the scope. */
export function resolveFor<D extends DepsMap>(step: {
  handle: () => RequestScope;
  deps: D;
  checked: () => Promise<void>;
  load: (module: ModuleRef) => Promise<Nexus>;
  section?: ModuleRef;
  log: NexusLog;
  adapter: string;
}): Promise<{ readonly deps: ResolvedDeps<D> } | Stop>;
/** inject's check: validateNow at definition for a Nexus, a validator() on the first request for a function source. */
export function definitionCheck(
  source: ContainerSource,
  container: () => Promise<Nexus>,
  deps: DepsMap,
  log: NexusLog,
  adapter: string,
): () => Promise<void>;

/** Calls fn at most once; later calls return the first call's promise. */
export function once(fn: () => Promise<void>): () => Promise<void>;

/** One promise per module and container; a failed load is forgotten. */
export function loader(
  container: () => Promise<Nexus>,
): (module: ModuleRef) => Promise<Nexus>;

/** At route definition: ship.validate(deps) for a Nexus source, logging phase 'validate' and rethrowing; nothing for a function source. */
export function validateNow(
  source: ContainerSource,
  deps: DepsMap,
  log: NexusLog,
  adapter: string,
): void;

/** validate(deps) at most once per container, caching a failure. */
export function validator(
  container: () => Promise<Nexus>,
  deps: DepsMap,
  options?: LookupOptions,
): () => Promise<void>;

export type { DepsMap, ResolvedDeps };
```

The committed request-scope.ts at the branch HEAD (`libs/express/src/internal/request-scope.ts`) is the source of every copy. Task 1's Step 5 block below predates the review fixes (`validateFailure`, `guardLog`, the `'build'` phase in `toHttpError`, the warn level in `defaultLog` and the two `no-empty-object-type` disables), so later tasks copy the committed request-scope.ts at the branch HEAD, never that block.

```ts
// libs/hono/src/internal/dispose-with-body.ts (copied to react-router)
/** A response whose body disposes at end, error or cancel; a body-less response, HEAD, 204 or 304 disposes at once. */
export function disposeWithBody(
  response: Response,
  dispose: () => Promise<void>,
  method: string,
): Response;
```

Per-adapter public surface (spec sections 4 to 8 and 10):

| Package                 | Export                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nexusdi/express`      | `nexus(ship, options): NexusExpress` with `middleware`, `inject`, `scope(req)`, `load(module)`; `NexusHttpError`, `RequestScope`, `ContainerSource`, `NexusExpressOptions`, `NexusLog` |
| `@nexusdi/fastify`      | `nexus(ship, options): NexusFastify` with `plugin`, `encapsulatedPlugin`, `inject`, `scope(req)`, `load(module)`; same types                                                           |
| `@nexusdi/hono`         | `nexus(ship, options): NexusHono` with `middleware`, `inject`, `scope(c)`, `load(module)`; `NexusEnv`, `RequestScope`, `ContainerSource`, `NexusHonoOptions`, `NexusLog`               |
| `@nexusdi/react-router` | `nexus(ship, options): NexusRouter` with `middleware`, `inject`, `scope(context)`, `load(module)`; `NEXUS_SCOPE`, `existingScope`, same types                                          |
| `@nexusdi/next`         | `nexus(ship, options): NexusNext` with `route(deps, handler)`, `action(deps, fn)`; `NexusHttpError`, `ContainerSource`, `NexusNextOptions`, `NexusLog`                                 |
| `@nexusdi/vitest`       | `nexusFixtures(root, options?)`; `NexusFixtures`, `NexusFixturesOptions`                                                                                                               |
| `@nexusdi/react`        | react spec section 3: `NexusProvider`, `useService`, `useContainer`, `ScopeProvider`, `lazySection`, `SectionBoundary`, `react()`, the four error classes                              |

Options shared by every server adapter: `request` (typed by `RequestOption<Input>` of spec 3.2), `scopes?: { run<R>(scope: Scope, fn: () => R): R }`, `log?: NexusLog`.

## Review Focus

1. A request whose client leaves before the middleware runs. Expect no scope, no hang, and a framework-valid end of the request on every adapter (spec 0 item 23). Tasks 2, 5, 7 and 9 pin it.
2. A function-form container build that throws synchronously, or rejects while ten requests wait on it. Expect 503 for each waiter and one retry by the next request. Task 1 pins it.
3. A streaming response whose consumer cancels after the handler returned. Expect exactly one `scope:dispose` and no `NEXUS_DISPOSED` in the stream. Tasks 7 and 9 pin it.
4. A third-party plugin code thrown from a `construct` hook during `createScope`. Expect a 500 whose body holds no `NEXUS_`. Tasks 3, 6, 8, 10 and 17 pin it.
5. A copy of a shared file edited in one adapter only. Expect `adapter-shared-copies.test.ts` to fail and name both paths. Task 5 pins it.

## File map

```
libs/express/            @nexusdi/express (Tasks 1 to 3); src/internal/request-scope.ts is the first copy
libs/vitest/             @nexusdi/vitest (Task 4)
libs/fastify/            @nexusdi/fastify (Tasks 5, 6)
libs/hono/               @nexusdi/hono (Tasks 7, 8); src/internal/dispose-with-body.ts is the first copy
libs/react-router/       @nexusdi/react-router (Tasks 9, 10)
libs/react/              @nexusdi/react (Tasks 11 to 15)
libs/next/               @nexusdi/next (Tasks 16, 17)
examples/bridge-api/     the Meridian server demo (Task 18, edge legs in Tasks 21, 22)
examples/react-ssr/      migrated (Task 19)
examples/next-bridge/    Next demo (skeleton in Task 16, full in Task 20)
tools/repo-checks/src/adapter-shared-copies.test.ts   Task 5
tools/repo-checks/src/edge-safe.test.ts               Task 8
.github/workflows/ci.yml                               adapter-runtimes, adapter-peers jobs (Tasks 21 to 23)
examples/size/src/<adapter>.ts, hono-worker.ts         Task 24
scripts/verify-packaging.mjs, scripts/check-type-floor.mjs   Task 24
apps/docs/content/*.mdx, examples/meridian/src/pages/*.md    Tasks 25 to 27
RELEASING.md                                           Task 28
```

## Owner-only steps

These are the owner's, from a machine logged in to npm with 2FA. No task runs them; Task 28 lists them in the release checklist with the exact commands.

1. OWNER-ONLY: bootstrap the npm name of each new package with `.claude/skills/nexusdi-release/scripts/bootstrap.sh <pkg> <otp>`, set its trusted publisher (organization `NexusDI`, repository `core`, workflow `release.yml`, environment `release`, "Allow npm publish" and "Allow npm dist-tag" on), and deprecate the placeholder with `deprecate.sh`. Round one, once Tasks 1 to 15 are on `release/0.4`: `express`, `vitest`, `fastify`, `hono`, `react-router`, `react`. Round two, after the Next gate passes and Task 17 is on `release/0.4`: `next`.
2. OWNER-ONLY: confirm each publisher with `npm trust list @nexusdi/<pkg> --otp=<code>`.
3. OWNER-ONLY: dispatch the `rc` release event that publishes 0.4.0-rc.2 (and rc.3 if Next follows), per the `nexusdi-release` skill. Publishing is the owner's.
4. OWNER-ONLY: run any `npm dist-tag add` command that the reconcile step prints when a move fails.
5. OWNER-ONLY: add the `adapter-runtimes`, `adapter-peers` and `node-floor` checks (one per matrix leg) to the required status checks of the release rulesets in GitHub settings, so they gate a release (Task 28 lists the exact check names).
6. OWNER-ONLY: dispatch the `stable` release event at 0.4.0 final, which fast-forwards `main` (`RELEASING.md`), after every adapter has been in at least one RC with its demo app green (Q2).

---

### Task 1: Express package and the shared request-scope.ts

Files:

- Create: `libs/express/` (generator), `libs/express/src/internal/request-scope.ts`, `libs/express/src/internal/request-scope.test.ts`, `libs/express/test-support/nexus-request.ts`, `libs/express/src/index.ts`, `libs/express/docs/examples.md`
- Modify: `libs/express/package.json`, `libs/express/project.json`, `libs/express/vite.config.ts`, `libs/express/tsconfig.lib.json`, `libs/express/tsconfig.spec.json`, `libs/express/eslint.config.mjs`, `commitlint.config.js`, `CONTRIBUTING.md` (Scopes), `.fallowrc.jsonc` (`publicPackages`, `entry`)

Interfaces:

- Consumes: `@nexusdi/core` 0.4.0-rc.1: `isNexusError(value, code?)`, `BlueprintError` (with `errors: readonly NexusError[]`), `Nexus` (`createScope`, `load`, `validate`), `Scope`, `NexusRequest`, `DepsMap`, `ResolvedDeps`, `LookupOptions`, `ModuleRef`.
- Produces: every export of the header's `request-scope.ts` contract, plus four types the adapters need and the contract did not list:
  - `export interface ScopeRunner { run<R>(scope: Scope, fn: () => R): R }`
  - `export type RequestMapping<Input> = (input: Input) => NexusRequest | Promise<NexusRequest>`
  - `export type RequestOption<Input> = {} extends NexusRequest ? { readonly request?: RequestMapping<Input> } : { readonly request: RequestMapping<Input> }`
  - `export type OptionsArg<O> = {} extends NexusRequest ? [options?: O] : [options: O]`
  - `export function logEach(error: unknown, log: NexusLog, adapter: string, phase: LogPhase): void` (one log call per inner error of a `BlueprintError`, one call otherwise).
  - `export function validateNow(source: ContainerSource, deps: DepsMap, log: NexusLog, adapter: string): void` (agreed with Part B): for a `Nexus` it calls `ship.validate(deps)`, and on failure logs through `logEach` (one call per inner error of a `BlueprintError`, phase `'validate'`) and rethrows; for a function source it does nothing, because `validator()` covers the first request.

The file is byte-identical in every server adapter (Tasks 5, 7, 9 and 17 copy it). It names no adapter: every function takes the adapter name as an argument.

- [ ] **Step 1: Scaffold the package**

```bash
cd /path/to/worktree   # the branch cut from origin/release/0.4
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/express --name=@nexusdi/express --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
```

If `nx.json` lost a comment, run `git checkout nx.json` and re-apply only the generator's functional additions. Delete `libs/express/src/lib/`. Copy `libs/node/tsconfig.json`, `libs/node/tsconfig.lib.json`, `libs/node/tsconfig.spec.json`, `libs/node/eslint.config.mjs` and `libs/node/project.json` over the generated files, then in `project.json` set `"name": "@nexusdi/express"`. In `tsconfig.lib.json` keep `"types": ["node"]` (for `console` and `Error.cause` typings only; the source imports no `node:` module). Copy `libs/node/LICENSE` and create an empty `CHANGELOG.md` with the line `# Changelog`.

`libs/express/package.json`:

```json
{
  "name": "@nexusdi/express",
  "version": "0.4.0-rc.1",
  "description": "Give every Express request its own NexusDI scope, disposed when the response is done.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "express",
    "express-middleware",
    "request scope",
    "typescript"
  ],
  "homepage": "https://github.com/NexusDI/core#readme",
  "bugs": { "url": "https://github.com/NexusDI/core/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/express"
  },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22.12" },
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "@nexusdi/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/**/*.tsbuildinfo",
    "src",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/*.test-d.*",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "peerDependencies": {
    "@nexusdi/core": "0.4.0-rc.1",
    "express": "^5.0.0",
    "@types/express": "^5.0.0"
  },
  "peerDependenciesMeta": { "@types/express": { "optional": true } },
  "devDependencies": { "express": "^5.3.0", "@types/express": "^5.0.6" },
  "publishConfig": { "access": "public", "provenance": true }
}
```

`libs/express/vite.config.ts` is `libs/node/vite.config.ts` with `cacheDir: '../../node_modules/.vite/libs/express'` and `name: '@nexusdi/express'`.

`libs/express/docs/examples.md` holds one heading and one sentence for now; Task 3 fills it:

```md
# @nexusdi/express examples

The README's Quick Example is the first one; Task 3 adds the route test.
```

`commitlint.config.js`: add `'express',` to `scope-enum` after `'cli',`. `CONTRIBUTING.md`, Scopes: add `- **express**: Changes to the \`@nexusdi/express\` library`. `.fallowrc.jsonc`: add `"@nexusdi/express"`to`publicPackages`, and `"libs/express/test-support/nexus-request.ts"`and`"libs/express/src/**/*.test-d.ts"`to`entry`. `npm-readmes-data.ts`stays unchanged until Task 3 writes the README, because`npm-readmes.test.ts`reads`libs/<name>/README.md`for every entry of`PACKAGES`.

Run `npm install` from the root, then `NX_NO_CLOUD=true NX_DAEMON=false npx nx sync`.

- [ ] **Step 2: Write the request augmentation the tests share**

`libs/express/test-support/nexus-request.ts`, which `tsconfig.spec.json` includes through `test-support/**/*.ts`, as `libs/core/test-support/nexus-request.ts` does for core:

```ts
// The request every test in this package maps: a shuttle's mission. Optional,
// so the adapter's `request` option stays optional, as it is for an app that
// declares no required field.
declare module '@nexusdi/core' {
  interface NexusRequest {
    mission?: { id: string; target: string };
  }
}

export {};
```

Every server adapter and `@nexusdi/vitest` carries this file. It is under the fallow duplicates threshold (30 tokens); if `npx fallow dupes` reports it, add `"libs/*/test-support/nexus-request.ts"` to `duplicates.ignore` and the same glob to `no-copies.test.ts` `ALLOWLIST` with the reason "test-support, outside published source: each package's tests declare the request they map" (it spans `libs/core` and `libs/express` at once, so the allowance is used).

- [ ] **Step 3: Write the failing test** `libs/express/src/internal/request-scope.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  BlueprintError,
  DisposedError,
  errorBase,
  MissingProviderError,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import {
  ContainerBuildError,
  containerOf,
  defaultLog,
  existingScope,
  loader,
  logEach,
  NexusHttpError,
  once,
  requestScope,
  RequestFinishedError,
  statusOf,
  toHttpError,
  validateNow,
  validator,
  type LogContext,
} from './request-scope.js';

const MISSION = new Token<NexusRequest['mission']>('Mission');
const providers = [
  provide(MISSION, {
    useFactory: (request: NexusRequest) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
];
const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('containerOf', () => {
  it('returns the container it was given', async () => {
    await using ship = await Nexus.create(providers);
    expect(await containerOf(ship)()).toBe(ship);
  });

  it('builds once for ten concurrent first calls', async () => {
    await using ship = await Nexus.create(providers);
    const build = vi.fn(() => Promise.resolve(ship));
    const container = containerOf(build);
    const all = await Promise.all(
      Array.from({ length: 10 }, () => container()),
    );
    expect(build).toHaveBeenCalledTimes(1);
    expect(new Set(all)).toEqual(new Set([ship]));
  });

  it('rejects every waiter with ContainerBuildError and builds again on the next call', async () => {
    await using ship = await Nexus.create(providers);
    const cause = new Error('charts offline');
    const build = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(ship);
    const container = containerOf(build);
    const waiters = await Promise.allSettled(
      Array.from({ length: 10 }, () => container()),
    );
    for (const result of waiters) {
      expect(result.status).toBe('rejected');
      const reason = (result as PromiseRejectedResult)
        .reason as ContainerBuildError;
      expect(reason).toBeInstanceOf(ContainerBuildError);
      expect(reason.cause).toBe(cause);
      expect(statusOf(reason)).toBe(503);
    }
    expect(await container()).toBe(ship);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('turns a synchronous throw into a rejection', async () => {
    const container = containerOf(() => {
      throw new Error('no reactor');
    });
    await expect(container()).rejects.toBeInstanceOf(ContainerBuildError);
  });
});

describe('requestScope', () => {
  it('creates no scope and calls no mapping until scope() is called', async () => {
    await using ship = await Nexus.create(providers);
    const request = vi.fn(() => survey);
    const handle = requestScope(containerOf(ship), request);
    expect(handle.started).toBe(false);
    await handle.close();
    expect(request).not.toHaveBeenCalled();
  });

  it('shares one scope between concurrent first uses', async () => {
    await using ship = await Nexus.create(providers);
    const create = vi.spyOn(ship, 'createScope');
    const handle = requestScope(containerOf(ship), () => survey);
    const [a, b] = await Promise.all([handle.scope(), handle.scope()]);
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
    expect(a.get(MISSION)).toEqual(survey.mission);
    await handle.close();
  });

  it('disposes the scope once on close and rejects a later first use', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    const scope = await handle.scope();
    await handle.close();
    expect(() => scope.get(MISSION)).toThrow(DisposedError);
    const late = requestScope(containerOf(ship), () => survey);
    await late.close();
    await expect(late.scope()).rejects.toBeInstanceOf(RequestFinishedError);
  });

  it('waits for a scope still being created when close runs', async () => {
    await using ship = await Nexus.create(providers);
    const handle = requestScope(containerOf(ship), () => survey);
    const pending = handle.scope();
    await handle.close();
    const scope = await pending;
    expect(() => scope.get(MISSION)).toThrow(DisposedError);
  });
});

describe('existingScope', () => {
  it('returns the given scope and disposes nothing', async () => {
    await using ship = await Nexus.create(providers);
    await using scope = await ship.createScope({ request: survey });
    const handle = existingScope(scope);
    expect(handle.started).toBe(true);
    expect(await handle.scope()).toBe(scope);
    await handle.close();
    expect(scope.get(MISSION)).toEqual(survey.mission);
  });
});

describe('statusOf and toHttpError', () => {
  const ThirdParty = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
    'ACME_STARDOCK_OFFLINE',
    'StardockOfflineError',
  );

  it('maps a disposed container to 503, any other NexusError to 500, anything else to undefined', () => {
    expect(statusOf(new DisposedError({ target: 'container' }))).toBe(503);
    expect(statusOf(new ThirdParty({ dock: '7' }))).toBe(500);
    expect(statusOf(new Error('plain'))).toBeUndefined();
    expect(statusOf(new RequestFinishedError())).toBeUndefined();
  });

  it('logs once and returns an error with the status text and no code', () => {
    const log = vi.fn();
    const error = new ThirdParty({ dock: '7' });
    const http = toHttpError(error, log, '@nexusdi/test', 'scope');
    expect(http).toBeInstanceOf(NexusHttpError);
    expect(http.status).toBe(500);
    expect(http.statusCode).toBe(500);
    expect(http.expose).toBe(false);
    expect(http.message).toBe('Internal Server Error');
    expect(http.cause).toBe(error);
    expect('code' in http).toBe(false);
    expect(log).toHaveBeenCalledExactlyOnceWith(error, {
      adapter: '@nexusdi/test',
      phase: 'scope',
      status: 500,
    } satisfies LogContext);
  });

  it('rethrows an error it does not map, without logging', () => {
    const log = vi.fn();
    const plain = new Error('handler bug');
    expect(() => toHttpError(plain, log, '@nexusdi/test', 'scope')).toThrow(
      plain,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it('says Service Unavailable for 503', () => {
    expect(new NexusHttpError(503, { cause: undefined }).message).toBe(
      'Service Unavailable',
    );
  });
});

describe('defaultLog and logEach', () => {
  it('writes the code, the fields and the message of a NexusError', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new MissingProviderError({
      token: 'NavCharts',
      module: 'root',
      path: [],
    } as never);
    defaultLog(error, { adapter: '@nexusdi/test', phase: 'validate' });
    expect(write).toHaveBeenCalledWith(
      '[@nexusdi/test] validate:',
      'NEXUS_MISSING_PROVIDER',
      expect.objectContaining({ token: 'NavCharts' }),
      error.message,
    );
    write.mockRestore();
  });

  it('writes the phase and the error for anything else', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('disposer failed');
    defaultLog(error, { adapter: '@nexusdi/test', phase: 'dispose' });
    expect(write).toHaveBeenCalledWith('[@nexusdi/test] dispose:', error);
    write.mockRestore();
  });

  it('logs each inner error of a BlueprintError', () => {
    const log = vi.fn();
    const inner = [
      new MissingProviderError({
        token: 'NavCharts',
        module: 'root',
        path: [],
      } as never),
      new MissingProviderError({
        token: 'FlightLog',
        module: 'root',
        path: [],
      } as never),
    ];
    logEach(new BlueprintError(inner), log, '@nexusdi/test', 'validate');
    expect(log.mock.calls.map(([error]) => error)).toEqual(inner);
  });
});

describe('validateNow', () => {
  it('passes for deps the container provides', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    validateNow(ship, { mission: MISSION }, log, '@nexusdi/test');
    expect(log).not.toHaveBeenCalled();
  });

  it('logs each missing entry once with phase validate and rethrows', async () => {
    await using ship = await Nexus.create(providers);
    const log = vi.fn();
    const absent = new Token<string>('Absent');
    const other = new Token<string>('Other');
    expect(() =>
      validateNow(ship, { absent, other }, log, '@nexusdi/test'),
    ).toThrow(BlueprintError);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.map(([, context]) => context)).toEqual([
      { adapter: '@nexusdi/test', phase: 'validate' },
      { adapter: '@nexusdi/test', phase: 'validate' },
    ]);
  });

  it('does nothing for a function source', () => {
    const build = vi.fn(() => Promise.reject(new Error('never called')));
    validateNow(
      build,
      { absent: new Token<string>('Absent') },
      vi.fn(),
      '@nexusdi/test',
    );
    expect(build).not.toHaveBeenCalled();
  });
});

describe('once, loader and validator', () => {
  it('calls once at most once', async () => {
    const fn = vi.fn(() => Promise.resolve());
    const run = once(fn);
    await Promise.all([run(), run(), run()]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('loads a module once per container and forgets a failed load', async () => {
    await using ship = await Nexus.create(providers);
    const load = vi
      .spyOn(ship, 'load')
      .mockRejectedValueOnce(new Error('section offline'))
      .mockResolvedValue(undefined);
    const section = { name: 'Navigation' } as never;
    const loadOf = loader(containerOf(ship));
    await expect(loadOf(section)).rejects.toThrow('section offline');
    expect(await loadOf(section)).toBe(ship);
    expect(await loadOf(section)).toBe(ship);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('validates once per container and keeps a failure', async () => {
    await using ship = await Nexus.create(providers);
    const missing = new Token<string>('Absent');
    const check = validator(containerOf(ship), { absent: missing });
    const validate = vi.spyOn(ship, 'validate');
    await expect(check()).rejects.toBeInstanceOf(BlueprintError);
    await expect(check()).rejects.toBeInstanceOf(BlueprintError);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
```

The two `MissingProviderError` constructions pass their fields through `as never`, because the test only needs a branded error with a `token` field, and the class's full field set belongs to core.

- [ ] **Step 4: Run it and see it fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/express`
Expected: FAIL, cannot find `./request-scope.js`.

- [ ] **Step 5: Implement** `libs/express/src/internal/request-scope.ts`

```ts
import {
  BlueprintError,
  isNexusError,
  type DepsMap,
  type LookupOptions,
  type ModuleRef,
  type Nexus,
  type NexusRequest,
  type ResolvedDeps,
  type Scope,
} from '@nexusdi/core';

/**
 * The request scope every server adapter shares. Each adapter carries a
 * byte-identical copy (integrations spec 3.7, P4's named exception), and
 * tools/repo-checks/src/adapter-shared-copies.test.ts fails when two copies
 * differ. The file names no adapter: callers pass their package name.
 */

export type { DepsMap, ResolvedDeps };

/** A live container, or a function that builds one on the first request. */
export type ContainerSource = Nexus | (() => Promise<Nexus>);

export type LogPhase = 'build' | 'scope' | 'load' | 'validate' | 'dispose';

export interface LogContext {
  readonly adapter: string;
  readonly phase: LogPhase;
  readonly status?: 500 | 503;
}

/** The `log` option. `error` is unknown: a disposer or a build may throw anything. */
export type NexusLog = (error: unknown, context: LogContext) => void;

/** What the `scopes` option takes: nodeScopes() from @nexusdi/node, or any object with run(). */
export interface ScopeRunner {
  run<R>(scope: Scope, fn: () => R): R;
}

export type RequestMapping<Input> = (
  input: Input,
) => NexusRequest | Promise<NexusRequest>;

/** `request` is required when the app's NexusRequest has a required field. */
export type RequestOption<Input> = {} extends NexusRequest
  ? { readonly request?: RequestMapping<Input> }
  : { readonly request: RequestMapping<Input> };

/** The options argument of nexus(): optional exactly when `request` is. */
export type OptionsArg<O> = {} extends NexusRequest
  ? [options?: O]
  : [options: O];

/** Raised around any rejection of the function form's build. Maps to 503. */
export class ContainerBuildError extends Error {
  constructor(options: { cause: unknown }) {
    super('the container failed to build', options);
    this.name = 'ContainerBuildError';
  }
}

/** Raised by scope() after close(): the request has finished. */
export class RequestFinishedError extends Error {
  constructor() {
    super('the request has finished');
    this.name = 'RequestFinishedError';
  }
}

const STATUS_TEXT = {
  500: 'Internal Server Error',
  503: 'Service Unavailable',
} as const;

/** The error an adapter hands its framework: status, status text as message, the original as cause, no `code`. */
export class NexusHttpError extends Error {
  readonly status: 500 | 503;
  readonly statusCode: 500 | 503;
  readonly expose = false as const;

  constructor(status: 500 | 503, options: { cause: unknown }) {
    super(STATUS_TEXT[status], options);
    this.name = 'NexusHttpError';
    this.status = status;
    this.statusCode = status;
  }
}

export interface RequestScope {
  /** Creates the scope on the first call; every later call returns the same promise. */
  scope(): Promise<Scope>;
  /** True once scope() has been called. */
  readonly started: boolean;
}

export interface ClosableRequestScope extends RequestScope {
  /** Disposes the scope if one was started, and refuses a later first use. */
  close(): Promise<void>;
}

/** One container per source: the Nexus itself, or the memoised build of the function. */
export function containerOf(source: ContainerSource): () => Promise<Nexus> {
  if (typeof source !== 'function') {
    const ready = Promise.resolve(source);
    return () => ready;
  }
  let pending: Promise<Nexus> | undefined;
  return () => {
    // Promise.resolve().then() turns a synchronous throw into a rejection.
    pending ??= Promise.resolve()
      .then(source)
      .catch((error: unknown) => {
        pending = undefined; // the next request builds again
        throw new ContainerBuildError({ cause: error });
      });
    return pending;
  };
}

export function requestScope(
  container: () => Promise<Nexus>,
  request: () => NexusRequest | undefined | Promise<NexusRequest | undefined>,
): ClosableRequestScope {
  let pending: Promise<Scope> | undefined;
  let closed = false;
  return {
    get started() {
      return pending !== undefined;
    },
    scope() {
      if (closed) return Promise.reject(new RequestFinishedError());
      pending ??= container().then(async (ship) =>
        ship.createScope({ request: await request() }),
      );
      return pending;
    },
    async close() {
      closed = true;
      if (pending === undefined) return;
      const scope = await pending.catch(() => undefined); // a failed create built nothing
      await scope?.[Symbol.asyncDispose]();
    },
  };
}

/** A RequestScope over a scope the caller owns: scope() returns it, close() disposes nothing. */
export function existingScope(scope: Scope): ClosableRequestScope {
  const ready = Promise.resolve(scope);
  return {
    started: true,
    scope: () => ready,
    close: () => Promise.resolve(),
  };
}

/** 503 for ContainerBuildError and NEXUS_DISPOSED, 500 for any other NexusError, undefined for anything else. */
export function statusOf(error: unknown): 500 | 503 | undefined {
  if (error instanceof ContainerBuildError) return 503;
  if (isNexusError(error, 'NEXUS_DISPOSED')) return 503;
  if (isNexusError(error)) return 500;
  return undefined;
}

/** Logs once through `log` and returns a NexusHttpError for a mapped error; rethrows anything else unchanged. */
export function toHttpError(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): NexusHttpError {
  const status = statusOf(error);
  if (status === undefined) throw error;
  log(error, { adapter, phase, status });
  return new NexusHttpError(status, { cause: error });
}

/** The default log: code, own enumerable fields and message for a NexusError; phase and error otherwise. */
export function defaultLog(error: unknown, context: LogContext): void {
  const prefix = `[${context.adapter}] ${context.phase}:`;
  if (isNexusError(error))
    console.error(prefix, error.code, { ...error }, error.message);
  else console.error(prefix, error);
}

/** One log call per inner error of a BlueprintError, one call for anything else. */
export function logEach(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): void {
  const errors = error instanceof BlueprintError ? error.errors : [error];
  for (const inner of errors) log(inner, { adapter, phase });
}

/**
 * Checks deps at route definition for a live container: logs each failing
 * entry and rethrows, so the app fails at startup. A function source has no
 * container yet; validator() checks it on the first request.
 */
export function validateNow(
  source: ContainerSource,
  deps: DepsMap,
  log: NexusLog,
  adapter: string,
): void {
  if (typeof source === 'function') return;
  try {
    source.validate(deps);
  } catch (error) {
    logEach(error, log, adapter, 'validate');
    throw error;
  }
}

/** Calls fn at most once; later calls return the first call's promise. */
export function once(fn: () => Promise<void>): () => Promise<void> {
  let done: Promise<void> | undefined;
  return () => (done ??= fn());
}

/** One promise per module and container; a failed load is forgotten. */
export function loader(
  container: () => Promise<Nexus>,
): (module: ModuleRef) => Promise<Nexus> {
  const loads = new WeakMap<Nexus, Map<ModuleRef, Promise<Nexus>>>();
  return async (module) => {
    const ship = await container();
    let byModule = loads.get(ship);
    if (byModule === undefined) {
      byModule = new Map();
      loads.set(ship, byModule);
    }
    const known = byModule.get(module);
    if (known !== undefined) return known;
    const pending = ship.load(module).then(() => ship);
    byModule.set(module, pending);
    const forget = byModule;
    pending.catch(() => forget.delete(module));
    return pending;
  };
}

/** validate(deps) at most once per container, caching a failure. */
export function validator(
  container: () => Promise<Nexus>,
  deps: DepsMap,
  options?: LookupOptions,
): () => Promise<void> {
  const checks = new WeakMap<Nexus, Promise<void>>();
  return async () => {
    const ship = await container();
    let check = checks.get(ship);
    if (check === undefined) {
      check = Promise.resolve().then(() => ship.validate(deps, options));
      checks.set(ship, check);
    }
    return check;
  };
}
```

`libs/express/src/index.ts` (Task 2 replaces it):

```ts
export {
  NexusHttpError,
  type ContainerSource,
  type LogContext,
  type NexusLog,
  type RequestScope,
} from './internal/request-scope.js';
```

- [ ] **Step 6: Run the tests, lint and typecheck**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/express`
Expected: PASS.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS (`commitlint-scope-enum`, `package-versions`, `owner-vocabulary` with its `NEXUS_DISPOSED` entry now used by `@nexusdi/express`, `core-layers` `nodeViolations`, `npm-readmes`, which does not list `express` yet).

- [ ] **Step 7: Commit**

```bash
git add libs/express commitlint.config.js CONTRIBUTING.md .fallowrc.jsonc package.json package-lock.json nx.json tsconfig.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(express): add the package and the shared request scope

The request scope, the container source, the status rule and the log
helpers live in src/internal/request-scope.ts. Every server adapter will
carry a byte-identical copy, under P4's named exception for the adapters.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Express middleware, inject, scope and load

Files:

- Create: `libs/express/src/nexus.ts`, `libs/express/src/nexus.test.ts`, `libs/express/src/nexus.test-d.ts`
- Modify: `libs/express/src/index.ts`

Interfaces:

- Consumes: Task 1's `containerOf`, `requestScope`, `once`, `loader`, `validator`, `validateNow`, `toHttpError`, `statusOf`, `defaultLog`, `NexusHttpError`, `ContainerSource`, `NexusLog`, `LogPhase`, `RequestScope`, `ClosableRequestScope`, `ScopeRunner`, `RequestOption`, `OptionsArg`, `DepsMap`, `ResolvedDeps`.
- Produces (public, from `@nexusdi/express`):
  - `nexus(ship: ContainerSource, ...args: OptionsArg<NexusExpressOptions>): NexusExpress`
  - `type NexusExpressOptions = RequestOption<Request> & { readonly scopes?: ScopeRunner; readonly log?: NexusLog }`
  - `type ExpressHandler<D extends DepsMap> = (deps: ResolvedDeps<D>, req: Request, res: Response, next: NextFunction) => unknown`
  - `interface NexusExpress { readonly middleware: RequestHandler; inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>): RequestHandler; scope(req: Request): Promise<Scope>; load(module: ModuleRef): SectionMiddleware }`
  - `interface SectionMiddleware extends RequestHandler { inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>): RequestHandler }`
  - the global augmentation `Express.Request.nexus?: RequestScope`
  - re-exports `NexusHttpError`, `ContainerSource`, `NexusLog`, `LogContext`, `RequestScope`.

- [ ] **Step 1: Write the failing test** `libs/express/src/nexus.test.ts`

The tests call the middleware and handlers with hand-built `req`, `res` and `next`. Task 3 runs a real server.

```ts
import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { NexusHttpError, nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface NavRoute {
  sector: string;
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<readonly NavRoute[]>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const bridge = [
  provide(MISSION, {
    useFactory: (request: NexusRequest) =>
      request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
];

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: [{ sector: 'Kepler' }] })],
  exports: [NAV_ROUTES],
});

async function shipWithTrace() {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(bridge, {
    plugins: [trace((event) => events.push(event))],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

/** A response that emits close when the test says so. */
function fakeResponse(closed = false) {
  const res = new EventEmitter() as EventEmitter & {
    closed: boolean;
    body?: unknown;
    json(body: unknown): void;
  };
  res.closed = closed;
  res.json = (body) => {
    res.body = body;
  };
  return res as unknown as Response & {
    body?: unknown;
    emit(event: 'close'): boolean;
  };
}

function fakeRequest(headers: Record<string, string> = {}) {
  return {
    get: (name: string) => headers[name.toLowerCase()],
    params: {},
  } as unknown as Request;
}

const mapping = (req: Request): NexusRequest => ({
  mission: {
    id: req.get('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

async function run(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
  res: Response,
) {
  const next = vi.fn();
  await handler(req, res, next);
  return next;
}

describe('middleware', () => {
  it('creates no scope and never calls the mapping for a request that resolves nothing', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const req = fakeRequest();
    const res = fakeResponse();
    const next = await run(di.middleware, req, res);
    expect(next).toHaveBeenCalledWith();
    res.emit('close');
    await vi.waitFor(() => expect(req.nexus?.started).toBe(false));
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('ends a request whose client left before the middleware ran, with no scope and no next()', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const req = fakeRequest();
    const next = await run(di.middleware, req, fakeResponse(true));
    expect(next).not.toHaveBeenCalled();
    expect(req.nexus).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope once when the response closes', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const req = fakeRequest({ 'x-mission-id': 'survey-9' });
    const res = fakeResponse();
    await run(di.middleware, req, res);
    const handler = di.inject({ log: FLIGHT_LOG }, ({ log }, _req, r) => {
      log.record('docked');
      r.json(log.entries());
    });
    await run(handler, req, res);
    expect((res as { body?: unknown }).body).toEqual(['survey-9: docked']);
    res.emit('close');
    res.emit('close');
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('runs the rest of the request inside scopes.run when scopes is set', async () => {
    const { ship } = await shipWithTrace();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const req = fakeRequest({ 'x-mission-id': 'survey-3' });
    const seen = await new Promise<string | undefined>((resolve) => {
      void di.middleware(req, fakeResponse(), () =>
        resolve(scopes.current()?.get(MISSION).id),
      );
    });
    expect(seen).toBe('survey-3');
    await ship[Symbol.asyncDispose]();
  });

  it('hands next() a 503 when the container is disposed and scopes is set', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes(), log });
    await ship[Symbol.asyncDispose]();
    const next = await run(di.middleware, fakeRequest(), fakeResponse());
    const error = next.mock.calls[0]?.[0] as NexusHttpError;
    expect(error).toBeInstanceOf(NexusHttpError);
    expect(error.status).toBe(503);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('inject', () => {
  it('throws at definition, and logs each missing entry, when a token has no provider', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    expect(() =>
      di.inject({ routes: NAV_ROUTES, log: FLIGHT_LOG }, () => undefined),
    ).toThrow(/NEXUS_BLUEPRINT_INVALID/);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/express',
      phase: 'validate',
    });
    await ship[Symbol.asyncDispose]();
  });

  it('validates on the first request with the function form, and answers 500', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(ship), { request: mapping, log });
    const handler = di.inject({ routes: NAV_ROUTES }, () => undefined);
    const req = fakeRequest();
    await run(di.middleware, req, fakeResponse());
    const next = await run(handler, req, fakeResponse());
    expect((next.mock.calls[0]?.[0] as NexusHttpError).status).toBe(500);
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 for every request while the function form fails to build, then recovers', async () => {
    const { ship } = await shipWithTrace();
    const build = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(new Error('charts offline'))
      .mockResolvedValue(ship);
    const di = nexus(build, { request: mapping, log: () => {} });
    const handler = di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
      res.json(log.entries()),
    );
    const first = fakeRequest();
    await run(di.middleware, first, fakeResponse());
    const failed = await run(handler, first, fakeResponse());
    expect((failed.mock.calls[0]?.[0] as NexusHttpError).status).toBe(503);
    const second = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, second, res);
    const ok = await run(handler, second, res);
    expect(ok).not.toHaveBeenCalled();
    expect((res as { body?: unknown }).body).toEqual([]);
    await ship[Symbol.asyncDispose]();
  });

  it('refuses a request on which the middleware never ran', async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const next = await run(
      di.inject({ log: FLIGHT_LOG }, () => undefined),
      fakeRequest(),
      fakeResponse(),
    );
    expect(String(next.mock.calls[0]?.[0])).toMatch(
      /register di\.middleware before this route/,
    );
    await expect(di.scope(fakeRequest())).rejects.toThrow(
      /register di\.middleware before this route/,
    );
    await ship[Symbol.asyncDispose]();
  });
});

describe('load', () => {
  it("lets a section's first request inject a token from the loaded module", async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const section = di.load(Navigation);
    const handler = section.inject(
      { routes: NAV_ROUTES },
      ({ routes }, _req, res) => res.json(routes),
    );
    const req = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, req, res);
    const loaded = await run(section, req, res);
    expect(loaded).toHaveBeenCalledWith();
    await run(handler, req, res);
    expect((res as { body?: unknown }).body).toEqual([{ sector: 'Kepler' }]);
    await ship[Symbol.asyncDispose]();
  });

  it('extends a scope that started before the section loaded', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
    const section = di.load(Navigation);
    const req = fakeRequest();
    const res = fakeResponse();
    await new Promise<void>((resolve) => {
      void di.middleware(req, res, () => resolve());
    });
    const before = await di.scope(req);
    await run(section, req, res);
    const after = await di.scope(req);
    expect(after).toBe(before);
    expect(after.get(NAV_ROUTES)).toEqual([{ sector: 'Kepler' }]);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });
});
```

`libs/express/src/nexus.test-d.ts`:

```ts
import type { Request, RequestHandler } from 'express';
import { expectTypeOf, test } from 'vitest';

import { all, lazy, MultiToken, Nexus, optional, Token } from '@nexusdi/core';

import { nexus, type RequestScope } from './index.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

declare const ship: Nexus;

test('inject types each entry of the record', () => {
  const di = nexus(ship);
  const handler = di.inject(
    {
      charts: NAV_CHARTS,
      maybe: optional(NAV_CHARTS),
      later: lazy(NAV_CHARTS),
      checks: all(DIAGNOSTICS),
    },
    (deps, req) => {
      expectTypeOf(deps.charts).toEqualTypeOf<INavCharts>();
      expectTypeOf(deps.maybe).toEqualTypeOf<INavCharts | undefined>();
      expectTypeOf(deps.later).toEqualTypeOf<() => INavCharts>();
      expectTypeOf(deps.checks).toEqualTypeOf<string[]>();
      expectTypeOf(req).toEqualTypeOf<Request>();
    },
  );
  expectTypeOf(handler).toEqualTypeOf<RequestHandler>();
});

test('req.nexus is an optional RequestScope', () => {
  expectTypeOf<Request['nexus']>().toEqualTypeOf<RequestScope | undefined>();
});

test('the request mapping must return a NexusRequest', () => {
  nexus(ship, {
    // @ts-expect-error mission must be { id, target }
    request: () => ({ mission: 7 }),
  });
});

test('nexus also takes a function that builds the container', () => {
  nexus(() => Nexus.create([]));
});
```

`all()` returns `T[]` per spec 3.3; if core's `ResolvedDeps` gives `readonly T[]`, the type test states what core gives and the assertion follows core.

- [ ] **Step 2: Run them and see them fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/express`
Expected: FAIL, `nexus` is not exported from `./index.js`.

- [ ] **Step 3: Implement** `libs/express/src/nexus.ts`

```ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ModuleRef, Scope } from '@nexusdi/core';

import {
  containerOf,
  defaultLog,
  loader,
  once,
  requestScope,
  statusOf,
  toHttpError,
  validateNow,
  validator,
  type ContainerSource,
  type DepsMap,
  type LogPhase,
  type NexusLog,
  type OptionsArg,
  type RequestOption,
  type RequestScope,
  type ResolvedDeps,
  type ScopeRunner,
} from './internal/request-scope.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- @types/express augments Request through this namespace
  namespace Express {
    interface Request {
      /** The request's scope handle, set by di.middleware. */
      nexus?: RequestScope;
    }
  }
}

const ADAPTER = '@nexusdi/express';

export type NexusExpressOptions = RequestOption<Request> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

export type ExpressHandler<D extends DepsMap> = (
  deps: ResolvedDeps<D>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

export interface SectionMiddleware extends RequestHandler {
  /** Like di.inject, validated after the section's first successful load. */
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
}

export interface NexusExpress {
  readonly middleware: RequestHandler;
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
  scope(req: Request): Promise<Scope>;
  load(module: ModuleRef): SectionMiddleware;
}

function handleOf(req: Request): RequestScope {
  const handle = req.nexus;
  if (handle === undefined)
    throw new Error(
      `[${ADAPTER}] no scope on this request: register di.middleware before this route`,
    );
  return handle;
}

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusExpressOptions>
): NexusExpress {
  const options = (args[0] ?? {}) as NexusExpressOptions;
  const log = options.log ?? defaultLog;
  const container = containerOf(ship);
  const load = loader(container);
  const mapped = (error: unknown, phase: LogPhase): unknown =>
    statusOf(error) === undefined
      ? error
      : toHttpError(error, log, ADAPTER, phase);

  const middleware: RequestHandler = async (req, res, next) => {
    const handle = requestScope(container, () => options.request?.(req));
    const dispose = once(() =>
      handle
        .close()
        .catch((error: unknown) =>
          log(error, { adapter: ADAPTER, phase: 'dispose' }),
        ),
    );
    if (res.closed) {
      await dispose(); // the client left before this ran: nothing to serve
      return;
    }
    res.once('close', () => void dispose());
    req.nexus = handle;
    if (options.scopes === undefined) {
      next(); // inject creates the scope on first use
      return;
    }
    let scope: Scope;
    try {
      scope = await handle.scope();
    } catch (error) {
      next(mapped(error, 'scope'));
      return;
    }
    options.scopes.run(scope, () => next());
  };

  /** validate() now for a live container (validateNow); on the first request for the function form. */
  const checkAtDefinition = (deps: DepsMap): (() => Promise<void>) => {
    validateNow(ship, deps, log, ADAPTER);
    return typeof ship === 'function'
      ? validator(container, deps)
      : () => Promise.resolve();
  };

  const handlerOf =
    <D extends DepsMap>(
      deps: D,
      handler: ExpressHandler<D>,
      ready: () => Promise<void>,
    ): RequestHandler =>
    async (req, res, next) => {
      let phase: LogPhase = 'validate';
      let resolved: ResolvedDeps<D>;
      try {
        await ready();
        phase = 'scope';
        const scope = await handleOf(req).scope();
        resolved = scope.resolve(deps);
      } catch (error) {
        next(mapped(error, phase));
        return;
      }
      await handler(resolved, req, res, next); // Express 5 forwards a rejection to next(err)
    };

  return {
    middleware,
    inject: (deps, handler) =>
      handlerOf(deps, handler, checkAtDefinition(deps)),
    scope: async (req) => handleOf(req).scope(),
    load(module) {
      const section: RequestHandler = async (req, _res, next) => {
        try {
          await load(module);
          const handle = req.nexus;
          if (handle?.started === true) await (await handle.scope()).extend();
        } catch (error) {
          next(mapped(error, 'load'));
          return;
        }
        next();
      };
      return Object.assign(section, {
        inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>) {
          const check = validator(container, deps);
          return handlerOf(deps, handler, async () => {
            await load(module);
            await check();
          });
        },
      });
    },
  };
}
```

`libs/express/src/index.ts`:

```ts
export {
  nexus,
  type ExpressHandler,
  type NexusExpress,
  type NexusExpressOptions,
  type SectionMiddleware,
} from './nexus.js';
export {
  NexusHttpError,
  type ContainerSource,
  type LogContext,
  type NexusLog,
  type RequestScope,
} from './internal/request-scope.js';
```

- [ ] **Step 4: Run the tests, lint and typecheck**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/express`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/express
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(express): add the middleware, inject, scope and load

The middleware creates no scope. The first inject creates it, and the
response's close event disposes it, which also covers a client that
aborts. A client that left before the middleware ran gets no scope and no
handler.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Express integration tests and README

Files:

- Create: `libs/express/src/express.e2e.test.ts`, `libs/express/README.md`
- Modify: `libs/express/docs/examples.md`, `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES` gains `'express'`, `SPECS` gains `express: { kind: 'sub-package', dev: false }`)

Interfaces:

- Consumes: Task 2's `nexus`, `NexusHttpError`.
- Produces: nothing new; the README's Quick Example is the region Task 25 cites for `/express/`.

- [ ] **Step 1: Write the failing integration test** `libs/express/src/express.e2e.test.ts`

```ts
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  errorBase,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const NAV_ROUTES = new Token<readonly string[]>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) =>
        request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, { useValue: fakeCharts }),
  ],
  exports: [FLIGHT_LOG, NAV_CHARTS],
});

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: ['Kepler', 'Gliese'] })],
  exports: [NAV_ROUTES],
});

const StardockOffline = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
  'ACME_STARDOCK_OFFLINE',
  'StardockOfflineError',
);
/** A third-party plugin whose construct hook fails every scoped build. */
const stardock: NexusPlugin = {
  name: 'acme:stardock',
  apiVersion: NEXUS_PLUGIN_API,
  construct: (_instance, _provider, scope) => {
    if (scope !== null) throw new StardockOffline({ dock: '7' });
    return undefined;
  },
};

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function listen(app: express.Express) {
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function bridgeWith(plugins: NexusPlugin[] = []) {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(BridgeApi, {
    plugins: [trace((event) => events.push(event)), ...plugins],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

const mapping = (req: express.Request): NexusRequest => ({
  mission: { id: req.get('x-mission-id') ?? 'survey-7', target: 'Kepler-442b' },
});

describe('@nexusdi/express on a real server', () => {
  it('disposes the scope after a JSON response is sent', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/course/:to',
          di.inject(
            { charts: NAV_CHARTS, log: FLIGHT_LOG },
            ({ charts, log }, req, res) => {
              log.record(`plotting ${req.params.to}`);
              res.json({
                course: charts.plot(String(req.params.to)),
                log: log.entries(),
              });
            },
          ),
        ),
    );
    const res = await fetch(`${url}/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      log: ['survey-9: plotting Kepler-442b'],
    });
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('keeps the scope open while a streamed body is still being written', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/stream',
          di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, res) => {
            res.write('[');
            await new Promise((resolve) => setTimeout(resolve, 30));
            log.record('late');
            expect(count('scope:dispose')).toBe(0);
            res.end(`${JSON.stringify(log.entries())}]`);
          }),
        ),
    );
    const body = await (await fetch(`${url}/stream`)).text();
    expect(body).toBe('[["survey-7: late"]]');
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope when the client aborts mid-stream', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/stream',
          di.inject({ log: FLIGHT_LOG }, async (_deps, _req, res) => {
            res.write('first chunk');
            await gate;
            res.end();
          }),
        ),
    );
    const abort = new AbortController();
    const res = await fetch(`${url}/stream`, { signal: abort.signal });
    await res.body?.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    release();
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope and answers 500 when a handler throws', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/fail',
          di.inject({ log: FLIGHT_LOG }, () => {
            throw new Error('sector not charted');
          }),
        ),
    );
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('gives 50 concurrent requests 50 scopes and shares no scoped instance', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, req, res) => {
            log.record(String(req.get('x-mission-id')));
            res.json(log.entries());
          }),
        ),
    );
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${url}/log`, { headers: { 'x-mission-id': `m${i}` } }).then(
          (r) => r.json(),
        ),
      ),
    );
    bodies.forEach((body, i) => expect(body).toEqual([`m${i}: m${i}`]));
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(50));
    expect(count('scope:create')).toBe(50);
    await ship[Symbol.asyncDispose]();
  });

  it('shares one scope between two first uses in one request', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get('/twice', async (req, res) => {
          const [a, b] = await Promise.all([di.scope(req), di.scope(req)]);
          res.json(a === b);
        }),
    );
    expect(await (await fetch(`${url}/twice`)).json()).toBe(true);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it("answers a section's first request with a token from the loaded module", async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const navigation = di.load(Navigation);
    const sector = express.Router();
    sector.use(navigation);
    sector.get(
      '/',
      navigation.inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
        res.json(routes),
      ),
    );
    const url = await listen(
      express().use(di.middleware).use('/navigation', sector),
    );
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('extends the ambient scope for a lazy section, keeping its identity', async () => {
    const { ship, count } = await bridgeWith();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const navigation = di.load(Navigation);
    let before: unknown;
    const url = await listen(
      express()
        .use(di.middleware)
        .use((_req, _res, next) => {
          before = scopes.current();
          next();
        })
        .use(navigation)
        .get('/', (_req, res) => {
          const current = scopes.current();
          res.json({
            same: current === before,
            routes: current?.get(NAV_ROUTES),
          });
        }),
    );
    expect(await (await fetch(url)).json()).toEqual({
      same: true,
      routes: ['Kepler', 'Gliese'],
    });
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('builds the function form once for ten concurrent first requests', async () => {
    const { ship } = await bridgeWith();
    const build = vi.fn(() => Promise.resolve(ship));
    const di = nexus(build, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
            res.json(log.entries()),
          ),
        ),
    );
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${url}/log`)));
    expect(build).toHaveBeenCalledTimes(1);
    await ship[Symbol.asyncDispose]();
  });

  it('answers 500 with no core text when a third-party plugin fails scope creation', async () => {
    const { ship } = await bridgeWith([stardock]);
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }, _req, res) =>
            res.json(flightLog.entries()),
          ),
        ),
    );
    const res = await fetch(`${url}/log`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('ACME_');
    expect(log).toHaveBeenCalledOnce();
    await ship[Symbol.asyncDispose]();
  });

  it('answers 500 with no token name when a token has no provider', async () => {
    const { ship } = await bridgeWith();
    const di = nexus(() => Promise.resolve(ship), {
      request: mapping,
      log: () => {},
    });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/routes',
          di.inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
            res.json(routes),
          ),
        ),
    );
    const res = await fetch(`${url}/routes`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('NavRoutes');
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 once the container is disposed', async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping, log: () => {} });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
            res.json(log.entries()),
          ),
        ),
    );
    await ship[Symbol.asyncDispose]();
    expect((await fetch(`${url}/log`)).status).toBe(503);
  });
});
```

- [ ] **Step 2: Run it and see it pass or fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/express -- express.e2e`
Expected: PASS for every case, since Task 2 implemented the behaviour. A failure here is a bug in Task 2's code: fix `nexus.ts`, never the test. The abort case is the one most likely to fail; it needs the `close` listener of Task 2, never `finish`.

- [ ] **Step 3: Write the README** `libs/express/README.md`

The README follows `tools/repo-checks/src/npm-readmes.ts` for a sub-package: title, badges, tagline, a lead-in, at least one H2 of its own, then Installation, Quick Example, Documentation, License, 90 lines at most, one doctest with a `// ->` claim, interface-first.

````md
# @nexusdi/express

[![npm](https://img.shields.io/npm/v/@nexusdi/express/next)](https://www.npmjs.com/package/@nexusdi/express)
[![license](https://img.shields.io/npm/l/@nexusdi/express)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give every Express request its own NexusDI scope, disposed when the response is done.**

A request-scoped service needs a scope per request, created when a handler first needs it and disposed when the response is finished or the client is gone. Express has no response hook, and a client that aborts emits `close` and never `finish`, so a hand-written scope leaks on every aborted request.

## How the scope follows the request

`di.middleware` attaches a scope handle to the request. The first `di.inject` handler creates the scope and resolves its typed deps from it. The response's `close` event disposes it, once, whether the body finished or the client left. A request that resolves nothing creates no scope.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/express@next @nexusdi/core@next express
```

## Quick Example

Each request gets its own flight log, so two requests never see each other's entries.

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship);

const bridge = express()
  .use(di.middleware)
  .get(
    '/course/:to',
    di.inject({ log: FLIGHT_LOG }, ({ log }, req, res) => {
      log.record(`plotting ${req.params.to}`);
      res.json(log.entries());
    }),
  );

const server = bridge.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
const res = await fetch(`http://127.0.0.1:${port}/course/Gliese-667`);
await res.json(); // -> ['plotting Gliese-667']
server.close();
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Scope an Express request](https://nexus.js.org/next/express/)
- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/express/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
````

`/express/` goes live in Task 25. Until then the `documentation` rule may refuse a link to a page `apps/docs/content` does not hold; if it does, link `/scopes/` only here and let Task 25 add the `/express/` link.

`libs/express/docs/examples.md`:

````md
# @nexusdi/express examples

## A route test with a testing container

`createBridge(ship)` builds the app from a container, so a test passes a testing container with fakes and reaches the route on a port-0 server.

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Token, provide } from '@nexusdi/core';
import { nexus, type ContainerSource } from '@nexusdi/express';
import { createTestingContainer } from '@nexusdi/testing';
import express from 'express';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

function createBridge(ship: ContainerSource) {
  const di = nexus(ship);
  return express()
    .use(di.middleware)
    .get(
      '/course/:to',
      di.inject({ charts: NAV_CHARTS }, ({ charts }, req, res) => {
        res.json(charts.plot(String(req.params.to)));
      }),
    );
}

const ship = await createTestingContainer({
  providers: [
    provide(NAV_CHARTS, { useValue: { plot: () => ({ to: '', heading: 0 }) } }),
  ],
})
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const server = createBridge(ship).listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
await res.json(); // -> { to: 'Kepler-442b', heading: 42 }
server.close();
await ship[Symbol.asyncDispose]();
```
````

`createTestingContainer` takes a `ModuleRef`; if the `{ providers }` root form is refused by its type, wrap the provider in `defineModule({ name: 'BridgeApi', providers: [...], exports: [NAV_CHARTS] })`.

- [ ] **Step 4: Run the package and the README checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/express @nexusdi/repo-checks`
Expected: PASS, the README doctests included (the Quick Example's `// ->` claim becomes an assertion).

- [ ] **Step 5: Commit**

```bash
git add libs/express tools/repo-checks/src/npm-readmes-data.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(express): run the adapter on a real server and add the README

The integration tests cover streamed bodies, client aborts, 50 concurrent
requests, lazy sections with and without an ambient scope, and bodies
that carry no core text for a third-party plugin code.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: @nexusdi/vitest fixtures

Files:

- Create: `libs/vitest/` (generator), `libs/vitest/src/fixtures.ts`, `libs/vitest/src/fixtures.test.ts`, `libs/vitest/src/fixtures.test-d.ts`, `libs/vitest/test-support/nexus-request.ts`, `libs/vitest/src/disposal.test.ts`, `libs/vitest/src/__fixtures__/disposal/vitest.config.ts`, `libs/vitest/src/__fixtures__/disposal/disposal.fixture.ts`, `libs/vitest/src/index.ts`, `libs/vitest/README.md`, `libs/vitest/docs/examples.md`
- Modify: `commitlint.config.js`, `CONTRIBUTING.md`, `.fallowrc.jsonc`, `tools/repo-checks/src/npm-readmes-data.ts`

Interfaces:

- Consumes: `createTestingContainer`, `TestingContainerBuilder`, `TestingCreateOptions` from `@nexusdi/testing`; `Fixtures` (type) from `@vitest/runner`.
- Produces:
  - `type NexusSetupStep = (builder: TestingContainerBuilder) => TestingContainerBuilder`
  - `interface NexusFixtures { nexusSetup: readonly NexusSetupStep[]; nexusRequest: NexusRequest | undefined; nexus: Nexus; nexusScope: Scope }`
  - `interface NexusFixturesOptions { readonly setup?: NexusSetupStep; readonly create?: TestingCreateOptions; readonly containerScope?: 'test' | 'file' }`
  - `nexusFixtures(root: ModuleRef, options?: NexusFixturesOptions): Fixtures<NexusFixtures>`

`nexusSetup` holds an array of steps, applied in order. Spec 8.1 types it as one function and overrides it with `test.override({ nexusSetup: (builder) => ... })`, which Vitest cannot do: Vitest treats every function value in a fixture map as a fixture factory (`isFixtureFunction` in `@vitest/runner`), and its own types refuse a function value. A suite overrides with `test.override({ nexusSetup: [(builder) => ...] })`. The spec gets this change in its section 8 in the same commit.

- [ ] **Step 1: Scaffold the package**

```bash
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/vitest --name=@nexusdi/vitest --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
```

Align with `libs/node` as in Task 1 Step 1 (tsconfigs, eslint, project.json with `"name": "@nexusdi/vitest"`, vite.config.ts with `libs/vitest` and `@nexusdi/vitest`, LICENSE, CHANGELOG.md). In `vite.config.ts` also set `exclude: ['src/__fixtures__/**']` under `test`. `package.json` as Task 1's with these fields changed:

```json
{
  "name": "@nexusdi/vitest",
  "description": "Get a NexusDI testing container and scope in every Vitest test, disposed after it.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "vitest",
    "fixtures",
    "testing",
    "typescript"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/vitest"
  },
  "files": [
    "dist",
    "!dist/**/*.tsbuildinfo",
    "src",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/*.test-d.*",
    "!src/**/__fixtures__/**",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "peerDependencies": {
    "@nexusdi/core": "0.4.0-rc.1",
    "@nexusdi/testing": "0.4.0-rc.1",
    "vitest": "^4.1.0 || ^5.0.0",
    "@vitest/runner": "^4.1.0 || ^5.0.0"
  }
}
```

`@vitest/runner` is a peer because the published declarations import its `Fixtures` type; every Vitest install carries it. Add `'vitest',` to `commitlint.config.js` `scope-enum`, the line `- **vitest**: Changes to the \`@nexusdi/vitest\` library`to CONTRIBUTING's Scopes,`"@nexusdi/vitest"`to`.fallowrc.jsonc` `publicPackages`, `"libs/vitest/src/**/\*.test-d.ts"`and`"libs/vitest/src/**fixtures**/**"`to its`entry`, and `'vitest'`with`vitest: { kind: 'sub-package', dev: true }`to`npm-readmes-data.ts`. Copy `libs/express/test-support/nexus-request.ts`to`libs/vitest/test-support/nexus-request.ts`and add it to`.fallowrc.jsonc` `entry`.

`package-versions.test.ts` checks the `@nexusdi/core` peer only. Add the `@nexusdi/testing` case in this task:

```ts
it.each(
  libs.filter(
    (dir) => read(dir).peerDependencies?.['@nexusdi/testing'] !== undefined,
  ),
)('gives %s an exact peer dependency on @nexusdi/testing', (dir) => {
  expect(read(dir).peerDependencies?.['@nexusdi/testing']).toBe(core.version);
});
```

- [ ] **Step 2: Write the failing test** `libs/vitest/src/fixtures.test.ts`

```ts
import { describe, expect, test as base } from 'vitest';

import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

import { nexusFixtures } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission | undefined>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

const realCharts: INavCharts = { plot: (to) => ({ to, heading: 0 }) };
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: MemoryFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, { useValue: realCharts }),
  ],
  exports: [MISSION, FLIGHT_LOG, NAV_CHARTS],
});

const events: TraceEvent[] = [];
const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
    create: { plugins: [trace((event) => events.push(event))] },
  }),
);

const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('nexusFixtures', () => {
  test('applies the setup to the container', ({ nexus }) => {
    expect(nexus.get(NAV_CHARTS).plot('Kepler-442b').heading).toBe(42);
  });

  describe('with a request', () => {
    test.override({ nexusRequest: survey });

    test('passes nexusRequest to REQUEST in nexusScope', ({ nexusScope }) => {
      expect(nexusScope.get(MISSION)).toEqual(survey.mission);
    });

    test('gives each scope its own scoped instance', async ({
      nexus,
      nexusScope,
    }) => {
      nexusScope.get(FLIGHT_LOG).record('launch');
      await using other = await nexus.createScope({ request: survey });
      expect(other.get(FLIGHT_LOG).entries()).toEqual([]);
    });
  });

  describe('with an overridden setup', () => {
    test.override({
      nexusSetup: [
        (builder) => builder.override(NAV_CHARTS, { useValue: realCharts }),
      ],
    });

    test('replaces the file setup for the suite', ({ nexus }) => {
      expect(nexus.get(NAV_CHARTS).plot('Kepler-442b').heading).toBe(0);
    });
  });

  test('disposes the scope before the container, after each test', async ({
    nexusScope,
  }) => {
    nexusScope.get(FLIGHT_LOG);
    events.length = 0;
  });

  test('saw the previous test dispose its scope, then its container', () => {
    const order = events
      .map((event) => event.type)
      .filter(
        (type) => type === 'scope:dispose' || type === 'dispose:instance',
      );
    expect(order[0]).toBe('scope:dispose');
  });
});

const fileTest = base.extend(
  nexusFixtures(Meridian, { containerScope: 'file' }),
);
let first: unknown;

describe('containerScope: file', () => {
  fileTest('builds the container for the first test', ({ nexus }) => {
    first = nexus;
  });
  fileTest('shares it with the next test in the file', ({ nexus }) => {
    expect(nexus).toBe(first);
  });
});
```

The two ordering tests rely on Vitest running a file's tests in order, which it does unless the file opts into `concurrent`.

`libs/vitest/src/disposal.test.ts`, the nested run that proves a disposal error fails the test that owned the container:

```ts
import { join } from 'node:path';

import { expect, it } from 'vitest';
import { startVitest } from 'vitest/node';

it('fails the test whose container throws on disposal', async () => {
  const root = join(import.meta.dirname, '__fixtures__', 'disposal');
  const vitest = await startVitest('test', [], {
    root,
    config: join(root, 'vitest.config.ts'),
    watch: false,
    reporters: [],
  });
  const results = vitest.state.getFiles().flatMap((file) => file.tasks);
  const byName = Object.fromEntries(
    results.map((task) => [task.name, task.result?.state]),
  );
  await vitest.close();
  expect(byName).toEqual({
    'passes and still fails on disposal': 'fail',
    'passes with a clean container': 'pass',
  });
});
```

`libs/vitest/src/__fixtures__/disposal/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['disposal.fixture.ts'], watch: false },
});
```

`libs/vitest/src/__fixtures__/disposal/disposal.fixture.ts`:

```ts
import { test as base } from 'vitest';

import { defineModule, provide, Token } from '@nexusdi/core';

import { nexusFixtures } from '../../index.js';

interface IReactorCore {
  scram(): void;
}
const REACTOR = new Token<IReactorCore>('Reactor');

class FailingReactor implements IReactorCore {
  scram() {}
  [Symbol.asyncDispose]() {
    return Promise.reject(new Error('scram failed'));
  }
}
class FusionReactor implements IReactorCore {
  scram() {}
}

const failing = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FailingReactor })],
  exports: [REACTOR],
});
const clean = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
  exports: [REACTOR],
});

base.extend(nexusFixtures(failing))(
  'passes and still fails on disposal',
  ({ nexus }) => {
    nexus.get(REACTOR).scram();
  },
);
base.extend(nexusFixtures(clean))(
  'passes with a clean container',
  ({ nexus }) => {
    nexus.get(REACTOR).scram();
  },
);
```

`libs/vitest/src/fixtures.test-d.ts`:

```ts
import { expectTypeOf, test as base } from 'vitest';

import {
  defineModule,
  type Nexus,
  type NexusRequest,
  type Scope,
} from '@nexusdi/core';
import type { TestingContainerBuilder } from '@nexusdi/testing';

import { nexusFixtures, type NexusSetupStep } from './index.js';

const Meridian = defineModule({ name: 'Meridian' });
const test = base.extend(nexusFixtures(Meridian));

test('types the fixtures in a test callback', ({
  nexus,
  nexusScope,
  nexusRequest,
  nexusSetup,
}) => {
  expectTypeOf(nexus).toEqualTypeOf<Nexus>();
  expectTypeOf(nexusScope).toEqualTypeOf<Scope>();
  expectTypeOf(nexusRequest).toEqualTypeOf<NexusRequest | undefined>();
  expectTypeOf(nexusSetup).toEqualTypeOf<readonly NexusSetupStep[]>();
});

test('a setup step maps a builder to a builder', () => {
  expectTypeOf<NexusSetupStep>().toEqualTypeOf<
    (builder: TestingContainerBuilder) => TestingContainerBuilder
  >();
});
```

If `base.extend(nexusFixtures(Meridian))` does not infer the four fixture types, the README and the tests write `base.extend<NexusFixtures>(nexusFixtures(Meridian))`, and the type test states that form.

- [ ] **Step 3: Run them and see them fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/vitest`
Expected: FAIL, `nexusFixtures` is not exported.

- [ ] **Step 4: Implement** `libs/vitest/src/fixtures.ts`

```ts
import type { Fixtures } from '@vitest/runner';

import type { ModuleRef, Nexus, NexusRequest, Scope } from '@nexusdi/core';
import {
  createTestingContainer,
  type TestingContainerBuilder,
  type TestingCreateOptions,
} from '@nexusdi/testing';

/** One change to the testing container's builder, such as an override. */
export type NexusSetupStep = (
  builder: TestingContainerBuilder,
) => TestingContainerBuilder;

export interface NexusFixtures {
  /** The builder steps, in order. An array, because Vitest runs a function value as a fixture. */
  nexusSetup: readonly NexusSetupStep[];
  /** The request REQUEST resolves to in nexusScope. */
  nexusRequest: NexusRequest | undefined;
  /** A testing container, built on first use and disposed after the test. */
  nexus: Nexus;
  /** A scope of nexus, built on first use and disposed before nexus. */
  nexusScope: Scope;
}

export interface NexusFixturesOptions {
  /** The file's builder step; a suite replaces it with test.override({ nexusSetup: [...] }). */
  readonly setup?: NexusSetupStep;
  /** Passed to the builder's create(): plugins, onInit. */
  readonly create?: TestingCreateOptions;
  /** 'file' shares one container across a file's tests, for a slow onInit. Defaults to 'test'. */
  readonly containerScope?: 'test' | 'file';
}

export function nexusFixtures(
  root: ModuleRef,
  options: NexusFixturesOptions = {},
): Fixtures<NexusFixtures> {
  const scope = options.containerScope ?? 'test';
  const steps: readonly NexusSetupStep[] =
    options.setup === undefined ? [] : [options.setup];
  return {
    nexusSetup: [steps, { scope }],
    nexusRequest: [undefined, { scope: 'test' }],
    nexus: [
      async ({ nexusSetup }, use) => {
        const builder = nexusSetup.reduce(
          (current, step) => step(current),
          createTestingContainer(root),
        );
        await using ship = await builder.create(options.create);
        await use(ship);
      },
      { scope },
    ],
    nexusScope: async ({ nexus, nexusRequest }, use) => {
      await using scope = await nexus.createScope({ request: nexusRequest });
      await use(scope);
    },
  };
}
```

`await using` compiles because the build targets ES2022 and TypeScript lowers it (spec 3.4). If the `Fixtures` type refuses the file-scoped `nexus` reading test-scoped `nexusSetup` or the tuple forms, type the object with `as Fixtures<NexusFixtures>` after the literal and keep the runtime shape.

`libs/vitest/src/index.ts`:

```ts
export {
  nexusFixtures,
  type NexusFixtures,
  type NexusFixturesOptions,
  type NexusSetupStep,
} from './fixtures.js';
```

- [ ] **Step 5: Run the tests**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/vitest`
Expected: PASS.

- [ ] **Step 6: Write the README** `libs/vitest/README.md`

````md
# @nexusdi/vitest

[![npm](https://img.shields.io/npm/v/@nexusdi/vitest/next)](https://www.npmjs.com/package/@nexusdi/vitest)
[![license](https://img.shields.io/npm/l/@nexusdi/vitest)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Get a NexusDI testing container and scope in every Vitest test, disposed after it.**

Every test file that exercises the real module graph builds a testing container, overrides a few providers and disposes it. A test that forgets `await using` leaks its container into the next test.

## Fixtures for the module graph

`nexusFixtures(root, { setup })` returns Vitest fixtures: `nexus`, a testing container built on first use, and `nexusScope`, a scope of it. Vitest disposes the scope, then the container, when the test ends, pass or fail. A suite swaps the overrides or the request with `test.override`.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install -D @nexusdi/vitest@next @nexusdi/testing@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { defineModule, provide, Token } from '@nexusdi/core';
import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

const test = base.extend(
  nexusFixtures(Tactical, {
    setup: (builder) => builder.override(NAV_CHARTS, { useValue: fakeCharts }),
  }),
);

test('plots with the fake charts', ({ nexus }) => {
  nexus.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
});
```

## Documentation

- [How do I get a container in every Vitest test?](https://nexus.js.org/next/vitest/)
- [How do I replace a provider in a test?](https://nexus.js.org/next/testing/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/vitest/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
````

A doctest that declares a `test()` inside an `import.meta.vitest` block may not register with the running suite. If the doctest runner rejects it, turn the last statement into a direct call that needs no `test()`: build the fixtures object, call its `nexus` fixture function with `{ nexusSetup: [step] }` and a `use` that runs the claim. The `// ->` claim stays. `/vitest/` goes live in Task 27; link `/testing/` only until then if the `documentation` rule refuses the link.

`libs/vitest/docs/examples.md` holds the suite override example from spec 8.1, rewritten for the array form:

````md
# @nexusdi/vitest examples

## Swap an override for one suite

```ts
import { describe, expect } from 'vitest';
import { test } from '../test/fixtures';
import { FLIGHT_LOG, NAV_CHARTS, type INavCharts } from './contracts';
import { MemoryFlightLog } from '../test/doubles';
import { createBridge } from './hono';

describe('when the charts cannot plot', () => {
  const unplottable: INavCharts = {
    plot: () => {
      throw new Error('sector not charted');
    },
  };
  test.override({
    nexusSetup: [
      (builder) =>
        builder
          .override(NAV_CHARTS, { useValue: unplottable })
          .override(FLIGHT_LOG, { useClass: MemoryFlightLog }),
    ],
  });

  test('answers 500 for an uncharted sector', async ({ nexus }) => {
    const res = await createBridge(nexus).request('/course/Kepler-442b');
    expect(res.status).toBe(500);
  });
});
```
````

This fence has no `@import.meta.vitest` marker: it imports the demo app's files, which Task 18 creates.

- [ ] **Step 7: Check the spec's section 8**

Spec section 8.1 already shows the array form of `nexusSetup` and the `@vitest/runner` peer (applied with this plan). Compare the fixture types you wrote with the table in 8.1; a difference is a defect in this task.

- [ ] **Step 8: Run everything this task touches**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/vitest @nexusdi/repo-checks`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add libs/vitest commitlint.config.js CONTRIBUTING.md .fallowrc.jsonc tools/repo-checks/src package.json package-lock.json nx.json tsconfig.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(vitest): add nexus and nexusScope fixtures

Each test gets a testing container and a scope, built on first use and
disposed after the test, scope first. nexusSetup holds an array of builder
steps, because Vitest runs a function value as a fixture factory.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Fastify plugin and the copies check

Files:

- Create: `libs/fastify/` (generator), `libs/fastify/src/internal/request-scope.ts` (copy), `libs/fastify/src/nexus.ts`, `libs/fastify/src/nexus.test.ts`, `libs/fastify/src/nexus.test-d.ts`, `libs/fastify/test-support/nexus-request.ts` (copy), `libs/fastify/src/index.ts`, `libs/fastify/docs/examples.md`, `tools/repo-checks/src/adapter-shared-copies.ts`, `tools/repo-checks/src/adapter-shared-copies.test.ts`, `tools/repo-checks/src/__fixtures__/adapter-shared-copies/same/libs/a/src/internal/request-scope.ts`, `.../same/libs/b/src/internal/request-scope.ts`, `.../edited/libs/a/src/internal/request-scope.ts`, `.../edited/libs/b/src/internal/request-scope.ts`
- Modify: `commitlint.config.js`, `CONTRIBUTING.md`, `.fallowrc.jsonc` (`publicPackages`, `entry`, `duplicates.ignore`), `tools/repo-checks/src/no-copies.test.ts` (`ALLOWLIST`)

Interfaces:

- Consumes: Task 1's `request-scope.ts`, byte for byte.
- Produces:
  - `nexus(ship: ContainerSource, ...args: OptionsArg<NexusFastifyOptions>): NexusFastify`
  - `type NexusFastifyOptions = RequestOption<FastifyRequest> & { readonly scopes?: ScopeRunner; readonly log?: NexusLog }`
  - `type FastifyHandler<D extends DepsMap, G extends RouteGenericInterface> = (deps: ResolvedDeps<D>, req: FastifyRequest<G>, reply: FastifyReply) => unknown`
  - `interface NexusFastify { readonly plugin: FastifyPluginAsync; readonly encapsulatedPlugin: FastifyPluginAsync; inject<const D extends DepsMap, G extends RouteGenericInterface = RouteGenericInterface>(deps: D, handler: FastifyHandler<D, G>): RouteHandlerMethod<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, G>; scope(req: FastifyRequest): Promise<Scope>; load(module: ModuleRef): SectionHook }`
  - `interface SectionHook extends onRequestAsyncHookHandler { inject: NexusFastify['inject'] }`
  - `requestHook(container, options, log): onRequestHookHandler`, exported from `nexus.ts` for tests only (not from `index.ts`)
  - the module augmentation `FastifyRequest.nexus: RequestScope | null`
  - `sharedCopies(root: string): { violations: string[]; copies: Record<string, string[]> }` in `tools/repo-checks`

- [ ] **Step 1: Scaffold and copy the shared file**

```bash
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/fastify --name=@nexusdi/fastify --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
mkdir -p libs/fastify/src/internal
cp libs/express/src/internal/request-scope.ts libs/fastify/src/internal/request-scope.ts
cp libs/express/src/internal/request-scope.test.ts libs/fastify/src/internal/request-scope.test.ts
mkdir -p libs/fastify/test-support
cp libs/express/test-support/nexus-request.ts libs/fastify/test-support/nexus-request.ts
```

The copy of `request-scope.ts` is byte-identical: edit it only together with every other copy. Align the package with `libs/node` as in Task 1 Step 1 (`libs/fastify`, `@nexusdi/fastify`). `package.json` as Task 1's with:

```json
{
  "name": "@nexusdi/fastify",
  "description": "Give every Fastify request its own NexusDI scope, disposed when the response is done.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "fastify",
    "fastify-plugin",
    "request scope",
    "typescript"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/fastify"
  },
  "peerDependencies": { "@nexusdi/core": "0.4.0-rc.1", "fastify": "^5.0.0" },
  "dependencies": { "fastify-plugin": "^6.0.0" },
  "devDependencies": { "fastify": "^5.12.7" }
}
```

(no `peerDependenciesMeta`). Add `'fastify',` to `scope-enum`, the Scopes line in CONTRIBUTING, `"@nexusdi/fastify"` to `publicPackages`, `"libs/fastify/test-support/nexus-request.ts"` and `"libs/fastify/src/**/*.test-d.ts"` to `entry`. `npm-readmes-data.ts` gains `'fastify'` in Task 6, with the README.

- [ ] **Step 2: Write the failing copies check** `tools/repo-checks/src/adapter-shared-copies.test.ts`

The fixtures: under `__fixtures__/adapter-shared-copies/same/`, both `libs/a/src/internal/request-scope.ts` and `libs/b/src/internal/request-scope.ts` hold `export const shared = 1;\n`. Under `edited/`, `libs/a/...` holds `export const shared = 1;\n` and `libs/b/...` holds `export const shared = 2;\n`.

```ts
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { sharedCopies } from './adapter-shared-copies.js';

const FIXTURES = join(
  import.meta.dirname,
  '__fixtures__',
  'adapter-shared-copies',
);

describe('sharedCopies', () => {
  it('accepts byte-identical copies', () => {
    const result = sharedCopies(join(FIXTURES, 'same'));
    expect(result.violations).toEqual([]);
    expect(result.copies['request-scope.ts']).toEqual([
      'libs/a/src/internal/request-scope.ts',
      'libs/b/src/internal/request-scope.ts',
    ]);
  });

  it('names both paths when one copy was edited alone', () => {
    expect(sharedCopies(join(FIXTURES, 'edited')).violations).toEqual([
      'libs/b/src/internal/request-scope.ts differs from libs/a/src/internal/request-scope.ts; edit every copy of request-scope.ts in one commit',
    ]);
  });

  const live = sharedCopies(workspaceRoot);

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });

  it('finds at least two adapters carrying request-scope.ts', () => {
    expect(live.copies['request-scope.ts']?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-shared-copies`
Expected: FAIL, cannot find `./adapter-shared-copies.js`.

- [ ] **Step 4: Implement** `tools/repo-checks/src/adapter-shared-copies.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { globSync } from 'tinyglobby';

/**
 * The adapters' shared files (integrations spec 3.7). The owner kept them as
 * copies, P4's named exception, so each copy must stay byte-identical to the
 * first one in path order. A change to one is a change to all, in one commit.
 */
export const SHARED = ['request-scope.ts', 'dispose-with-body.ts'] as const;

export interface SharedCopies {
  readonly violations: readonly string[];
  /** Each shared file's copies, as paths relative to the root, sorted. */
  readonly copies: Readonly<Record<string, readonly string[]>>;
}

export function sharedCopies(root: string): SharedCopies {
  const violations: string[] = [];
  const copies: Record<string, string[]> = {};
  for (const name of SHARED) {
    const paths = globSync(`libs/*/src/internal/${name}`, { cwd: root }).sort();
    copies[name] = paths;
    const [first, ...rest] = paths;
    if (first === undefined) continue;
    const reference = readFileSync(join(root, first), 'utf8');
    for (const path of rest)
      if (readFileSync(join(root, path), 'utf8') !== reference)
        violations.push(
          `${path} differs from ${first}; edit every copy of ${name} in one commit`,
        );
  }
  return { violations, copies };
}
```

- [ ] **Step 5: Allow the copy in fallow and in the P4 check**

`.fallowrc.jsonc`, `duplicates.ignore`, after the `security.ts` entry:

```jsonc
      // The server adapters' shared request scope, P4's named exception
      // (integrations spec 3.7, ruling V13). adapter-shared-copies.test.ts
      // keeps the copies byte-identical.
      "libs/*/src/internal/request-scope.ts",
```

`tools/repo-checks/src/no-copies.test.ts`, `ALLOWLIST`:

```ts
  {
    glob: 'libs/*/src/internal/request-scope.ts',
    reason:
      'P4 exception: the adapter copies (integrations spec 3.7, ruling V13); adapter-shared-copies.test.ts keeps them byte-identical',
  },
```

The entry lands now because `no-copies.test.ts` fails on an allowance whose glob spans fewer than two packages: Express and Fastify are the two.

- [ ] **Step 6: Write the failing adapter test** `libs/fastify/src/nexus.test.ts`

```ts
import { EventEmitter } from 'node:events';

import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { containerOf, defaultLog } from './internal/request-scope.js';
import { nexus } from './index.js';
import { requestHook } from './nexus.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<readonly string[]>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const bridge = [
  provide(MISSION, {
    useFactory: (request: NexusRequest) =>
      request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
];

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: ['Kepler'] })],
  exports: [NAV_ROUTES],
});

const mapping = (req: FastifyRequest): NexusRequest => ({
  mission: {
    id: String(req.headers['x-mission-id'] ?? 'survey-7'),
    target: 'Kepler-442b',
  },
});

async function shipWithTrace() {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(bridge, {
    plugins: [trace((event) => events.push(event))],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

describe('the plugin', () => {
  it('resolves typed deps per request and disposes the scope after the reply', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }) => {
        log.record('docked');
        return log.entries();
      }),
    );
    const res = await app.inject({
      url: '/log',
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(res.json()).toEqual(['survey-9: docked']);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await app.close();
    await ship[Symbol.asyncDispose]();
  });

  it('creates no scope for a route that resolves nothing', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const app = Fastify();
    await app.register(di.plugin);
    app.get('/ping', () => 'pong');
    expect((await app.inject({ url: '/ping' })).body).toBe('pong');
    expect(count('scope:create')).toBe(0);
    expect(request).not.toHaveBeenCalled();
    await app.close();
    await ship[Symbol.asyncDispose]();
  });

  it('calls done() and creates nothing when the client left before the hook ran', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const hook = requestHook(containerOf(ship), { request }, defaultLog);
    const raw = Object.assign(new EventEmitter(), { closed: true });
    const req = {
      nexus: null,
      log: { error: vi.fn() },
    } as unknown as FastifyRequest;
    const done = vi.fn();
    hook.call(
      undefined as never,
      req,
      { raw } as unknown as FastifyReply,
      done,
    );
    expect(done).toHaveBeenCalledWith();
    expect(req.nexus).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('carries the scope through the lifecycle when scopes is set', async () => {
    const { ship } = await shipWithTrace();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const app = Fastify();
    await app.register(di.plugin);
    app.get('/mission', async () => {
      await Promise.resolve();
      return { id: scopes.current()?.get(MISSION).id };
    });
    const res = await app.inject({
      url: '/mission',
      headers: { 'x-mission-id': 'survey-3' },
    });
    expect(res.json()).toEqual({ id: 'survey-3' });
    await app.close();
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 with no code field once the container is disposed', async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping, log: () => {} });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
    );
    await ship[Symbol.asyncDispose]();
    const res = await app.inject({ url: '/log' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).not.toHaveProperty('code');
    expect(res.body).not.toContain('NEXUS_');
    await app.close();
  });

  it('applies the encapsulated plugin only inside its context', async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(async (bridgeApi) => {
      await bridgeApi.register(di.encapsulatedPlugin);
      bridgeApi.get('/inside', async (req) => req.nexus !== null);
    });
    app.get('/outside', async (req) => req.nexus ?? null);
    expect((await app.inject({ url: '/inside' })).json()).toBe(true);
    expect((await app.inject({ url: '/outside' })).json()).toBeNull();
    await app.close();
    await ship[Symbol.asyncDispose]();
  });

  it("lets a section's first request inject a token from the loaded module", async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    const navigation = di.load(Navigation);
    await app.register(async (section) => {
      section.addHook('onRequest', navigation);
      section.get(
        '/navigation',
        navigation.inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
      );
    });
    expect((await app.inject({ url: '/navigation' })).json()).toEqual([
      'Kepler',
    ]);
    await app.close();
    await ship[Symbol.asyncDispose]();
  });

  it('refuses scope() on a request the plugin never saw', async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    await expect(di.scope({ nexus: null } as FastifyRequest)).rejects.toThrow(
      /register di\.plugin before this route/,
    );
    await ship[Symbol.asyncDispose]();
  });
});
```

`libs/fastify/src/nexus.test-d.ts`:

```ts
import Fastify, { type FastifyRequest } from 'fastify';
import { expectTypeOf, test } from 'vitest';

import { Nexus, Token } from '@nexusdi/core';

import { nexus, type RequestScope } from './index.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
declare const ship: Nexus;

test('inject takes the route generic from the route', () => {
  const di = nexus(ship);
  Fastify().get<{ Params: { to: string } }>(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS }, ({ charts }, req) => {
      expectTypeOf(req.params.to).toEqualTypeOf<string>();
      return charts.plot(req.params.to);
    }),
  );
});

test('req.nexus is a RequestScope or null', () => {
  expectTypeOf<FastifyRequest['nexus']>().toEqualTypeOf<RequestScope | null>();
});
```

If TypeScript does not infer `G` from the route's generic through the return type, the type test writes `di.inject<typeof deps, { Params: { to: string } }>` and the README shows that form; record the outcome in the README's Typed handlers line.

- [ ] **Step 7: Run them and see them fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/fastify`
Expected: FAIL, `nexus` and `requestHook` are not exported. `request-scope.test.ts` passes.

- [ ] **Step 8: Implement** `libs/fastify/src/nexus.ts`

```ts
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  onRequestHookHandler,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from 'fastify';
import fp from 'fastify-plugin';

import type { ModuleRef, Nexus, Scope } from '@nexusdi/core';

import {
  containerOf,
  defaultLog,
  loader,
  once,
  requestScope,
  statusOf,
  toHttpError,
  validateNow,
  validator,
  type ContainerSource,
  type DepsMap,
  type LogPhase,
  type NexusLog,
  type OptionsArg,
  type RequestOption,
  type RequestScope,
  type ResolvedDeps,
  type ScopeRunner,
} from './internal/request-scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The request's scope handle, set by di.plugin's onRequest hook. */
    nexus: RequestScope | null;
  }
}

const ADAPTER = '@nexusdi/fastify';

export type NexusFastifyOptions = RequestOption<FastifyRequest> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

export type FastifyHandler<
  D extends DepsMap,
  G extends RouteGenericInterface,
> = (
  deps: ResolvedDeps<D>,
  req: FastifyRequest<G>,
  reply: FastifyReply,
) => unknown;

type Inject = <
  const D extends DepsMap,
  G extends RouteGenericInterface = RouteGenericInterface,
>(
  deps: D,
  handler: FastifyHandler<D, G>,
) => RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  G
>;

export interface SectionHook extends onRequestAsyncHookHandler {
  /** Like di.inject, validated after the section's first successful load. */
  inject: Inject;
}

export interface NexusFastify {
  readonly plugin: FastifyPluginAsync;
  /** The same plugin without fastify-plugin's skip-override: scoped to the context it is registered in. */
  readonly encapsulatedPlugin: FastifyPluginAsync;
  inject: Inject;
  scope(req: FastifyRequest): Promise<Scope>;
  load(module: ModuleRef): SectionHook;
}

/** The onRequest hook, exported for tests. Callback style, so scopes.run(scope, done) carries the scope. */
export function requestHook(
  container: () => Promise<Nexus>,
  options: NexusFastifyOptions,
  log: NexusLog,
): onRequestHookHandler {
  return (req, reply, done) => {
    const handle = requestScope(container, () => options.request?.(req));
    const dispose = once(() =>
      handle
        .close()
        .catch((error: unknown) =>
          log(error, { adapter: ADAPTER, phase: 'dispose' }),
        ),
    );
    if (reply.raw.closed) {
      void dispose(); // nothing was created; Fastify still needs done() to end the lifecycle
      done();
      return;
    }
    reply.raw.once('close', () => void dispose());
    req.nexus = handle;
    if (options.scopes === undefined) {
      done(); // inject creates the scope on first use
      return;
    }
    const scopes = options.scopes;
    handle.scope().then(
      (scope) => scopes.run(scope, () => done()),
      (error: unknown) =>
        done(
          (statusOf(error) === undefined
            ? error
            : toHttpError(error, log, ADAPTER, 'scope')) as Error,
        ),
    );
  };
}

function handleOf(req: FastifyRequest): RequestScope {
  if (req.nexus === null || req.nexus === undefined)
    throw new Error(
      `[${ADAPTER}] no scope on this request: register di.plugin before this route`,
    );
  return req.nexus;
}

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusFastifyOptions>
): NexusFastify {
  const options = (args[0] ?? {}) as NexusFastifyOptions;
  const log = options.log ?? defaultLog;
  const container = containerOf(ship);
  const load = loader(container);
  const mapped = (error: unknown, phase: LogPhase): unknown =>
    statusOf(error) === undefined
      ? error
      : toHttpError(error, log, ADAPTER, phase);

  const register: FastifyPluginAsync = async (fastify) => {
    fastify.decorateRequest('nexus', null);
    fastify.addHook('onRequest', requestHook(container, options, log));
  };

  const checkAtDefinition = (deps: DepsMap): (() => Promise<void>) => {
    validateNow(ship, deps, log, ADAPTER);
    return typeof ship === 'function'
      ? validator(container, deps)
      : () => Promise.resolve();
  };

  const handlerOf = <D extends DepsMap, G extends RouteGenericInterface>(
    deps: D,
    handler: FastifyHandler<D, G>,
    ready: () => Promise<void>,
  ): RouteHandlerMethod<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    G
  > =>
    async function (req, reply) {
      let phase: LogPhase = 'validate';
      let resolved: ResolvedDeps<D>;
      try {
        await ready();
        phase = 'scope';
        resolved = (await handleOf(req).scope()).resolve(deps);
      } catch (error) {
        throw mapped(error, phase);
      }
      return handler(resolved, req, reply);
    };

  const inject: Inject = (deps, handler) =>
    handlerOf(deps, handler, checkAtDefinition(deps));

  return {
    plugin: fp(register, { name: ADAPTER, fastify: '5.x' }),
    encapsulatedPlugin: register,
    inject,
    scope: async (req) => handleOf(req).scope(),
    load(module) {
      const hook: onRequestAsyncHookHandler = async (req) => {
        try {
          await load(module);
          if (req.nexus?.started === true)
            await (await req.nexus.scope()).extend();
        } catch (error) {
          throw mapped(error, 'load');
        }
      };
      const sectionInject: Inject = (deps, handler) => {
        const check = validator(container, deps);
        return handlerOf(deps, handler, async () => {
          await load(module);
          await check();
        });
      };
      return Object.assign(hook, { inject: sectionInject });
    },
  };
}
```

`libs/fastify/src/index.ts`:

```ts
export {
  nexus,
  type FastifyHandler,
  type NexusFastify,
  type NexusFastifyOptions,
  type SectionHook,
} from './nexus.js';
export {
  NexusHttpError,
  type ContainerSource,
  type LogContext,
  type NexusLog,
  type RequestScope,
} from './internal/request-scope.js';
```

`libs/fastify/docs/examples.md`:

```md
# @nexusdi/fastify examples

The README's Quick Example is the first one; Task 6 adds the route test.
```

- [ ] **Step 9: Run every check this task touches**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/fastify @nexusdi/express @nexusdi/repo-checks`
Expected: PASS. `adapter-shared-copies` finds two copies, `no-copies` uses the new allowance, `owner-vocabulary` sees `@nexusdi/fastify` use its `NEXUS_DISPOSED` entry. Then run `npx fallow dupes` and expect no clone group under `libs/*/src/internal/`.

Then prove Review Focus 5 by hand: append a blank line to `libs/fastify/src/internal/request-scope.ts`, run `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-shared-copies`, expect FAIL naming `libs/fastify/src/internal/request-scope.ts differs from libs/express/src/internal/request-scope.ts`, then `git checkout libs/fastify/src/internal/request-scope.ts` (or remove the line if the file is not yet committed).

- [ ] **Step 10: Commit**

```bash
git add libs/fastify tools/repo-checks/src commitlint.config.js CONTRIBUTING.md .fallowrc.jsonc package.json package-lock.json nx.json tsconfig.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(fastify): add the plugin and check the adapter copies

The plugin's onRequest hook attaches the scope handle, and the raw
response's close event disposes the scope. request-scope.ts is now in two
adapters, so adapter-shared-copies.test.ts holds the copies byte-identical
and the P4 check allows the glob.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fastify integration tests and README

Files:

- Create: `libs/fastify/src/fastify.e2e.test.ts`, `libs/fastify/README.md`
- Modify: `libs/fastify/docs/examples.md`, `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES` gains `'fastify'`, `SPECS` gains `fastify: { kind: 'sub-package', dev: false }`)

Interfaces:

- Consumes: Task 5's `nexus`.
- Produces: the README Quick Example region Task 25 cites for `/fastify/`.

- [ ] **Step 1: Write the integration test** `libs/fastify/src/fastify.e2e.test.ts`

```ts
import { Readable } from 'node:stream';

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  errorBase,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const NAV_ROUTES = new Token<readonly string[]>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) =>
        request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => ({ to, heading: 42 }) },
    }),
  ],
  exports: [FLIGHT_LOG, NAV_CHARTS],
});

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: ['Kepler', 'Gliese'] })],
  exports: [NAV_ROUTES],
});

const StardockOffline = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
  'ACME_STARDOCK_OFFLINE',
  'StardockOfflineError',
);
const stardock: NexusPlugin = {
  name: 'acme:stardock',
  apiVersion: NEXUS_PLUGIN_API,
  construct: (_instance, _provider, scope) => {
    if (scope !== null) throw new StardockOffline({ dock: '7' });
    return undefined;
  },
};

const mapping = (req: FastifyRequest): NexusRequest => ({
  mission: {
    id: String(req.headers['x-mission-id'] ?? 'survey-7'),
    target: 'Kepler-442b',
  },
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function serve(app: FastifyInstance) {
  apps.push(app);
  return app.listen({ port: 0, host: '127.0.0.1' });
}

async function bridgeWith(plugins: NexusPlugin[] = []) {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(BridgeApi, {
    plugins: [trace((event) => events.push(event)), ...plugins],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

describe('@nexusdi/fastify on a real server', () => {
  it('disposes the scope after a JSON response', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get<{ Params: { to: string } }>(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        ({ charts, log }, req) => {
          log.record(`plotting ${req.params.to}`);
          return { course: charts.plot(req.params.to), log: log.entries() };
        },
      ),
    );
    const url = await serve(app);
    const res = await fetch(`${url}/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      log: ['survey-9: plotting Kepler-442b'],
    });
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('keeps the scope open while reply.send(stream) is still reading it', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, reply) => {
        async function* chunks() {
          yield '[';
          await new Promise((resolve) => setTimeout(resolve, 30));
          log.record('late');
          yield `${JSON.stringify(log.entries())}]`;
        }
        return reply.send(Readable.from(chunks()));
      }),
    );
    const url = await serve(app);
    expect(await (await fetch(`${url}/stream`)).text()).toBe(
      '[["survey-7: late"]]',
    );
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope when the client aborts mid-stream, where onResponse never fires', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, async (_deps, _req, reply) => {
        async function* chunks() {
          yield 'first chunk';
          await gate;
        }
        return reply.send(Readable.from(chunks()));
      }),
    );
    const url = await serve(app);
    const abort = new AbortController();
    const res = await fetch(`${url}/stream`, { signal: abort.signal });
    await res.body?.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    release();
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope and answers 500 when a handler throws', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/fail',
      di.inject({ log: FLIGHT_LOG }, () => {
        throw new Error('sector not charted');
      }),
    );
    const url = await serve(app);
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('gives 50 concurrent requests 50 scopes and shares no scoped instance', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, req) => {
        log.record(String(req.headers['x-mission-id']));
        return log.entries();
      }),
    );
    const url = await serve(app);
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${url}/log`, { headers: { 'x-mission-id': `m${i}` } }).then(
          (r) => r.json(),
        ),
      ),
    );
    bodies.forEach((body, i) => expect(body).toEqual([`m${i}: m${i}`]));
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(50));
    expect(count('scope:create')).toBe(50);
    await ship[Symbol.asyncDispose]();
  });

  it('shares one scope between two first uses in one request', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get('/twice', async (req) => {
      const [a, b] = await Promise.all([di.scope(req), di.scope(req)]);
      return a === b;
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/twice`)).json()).toBe(true);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it("answers a section's first request with a token from the loaded module", async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const navigation = di.load(Navigation);
    const app = Fastify();
    await app.register(di.plugin);
    await app.register(async (section) => {
      section.addHook('onRequest', navigation);
      section.get(
        '/navigation',
        navigation.inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
      );
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('extends the ambient scope for a lazy section, keeping its identity', async () => {
    const { ship, count } = await bridgeWith();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const navigation = di.load(Navigation);
    const app = Fastify();
    await app.register(di.plugin);
    await app.register(async (section) => {
      let before: unknown;
      section.addHook('onRequest', async () => {
        before = scopes.current();
      });
      section.addHook('onRequest', navigation);
      section.get('/navigation', async () => {
        const current = scopes.current();
        return { same: current === before, routes: current?.get(NAV_ROUTES) };
      });
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual({
      same: true,
      routes: ['Kepler', 'Gliese'],
    });
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('answers 500 with no core text and no code when a third-party plugin fails scope creation', async () => {
    const { ship } = await bridgeWith([stardock]);
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }) =>
        flightLog.entries(),
      ),
    );
    const url = await serve(app);
    const res = await fetch(`${url}/log`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('ACME_');
    expect(JSON.parse(body)).not.toHaveProperty('code');
    expect(log).toHaveBeenCalledOnce();
    await ship[Symbol.asyncDispose]();
  });

  it('drains in-flight requests on close before the container is disposed in onClose', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.addHook('onClose', () => ship[Symbol.asyncDispose]());
    app.get(
      '/slow',
      di.inject({ log: FLIGHT_LOG }, async ({ log }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        log.record('drained');
        return log.entries();
      }),
    );
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    const pending = fetch(`${url}/slow`).then((r) => r.json());
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.close();
    expect(await pending).toEqual(['survey-7: drained']);
    expect(count('scope:dispose')).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/fastify -- fastify.e2e`
Expected: PASS for every case. A failure is a bug in Task 5's `nexus.ts`: fix the code, never the test. If the drain case answers 503 because `close()` disposed the container before the in-flight request resolved, Fastify's `onClose` order is not what spec 6.1 says; record that in spec 6.2 and change the guide's shutdown order with it.

- [ ] **Step 3: Write the README** `libs/fastify/README.md`

````md
# @nexusdi/fastify

[![npm](https://img.shields.io/npm/v/@nexusdi/fastify/next)](https://www.npmjs.com/package/@nexusdi/fastify)
[![license](https://img.shields.io/npm/l/@nexusdi/fastify)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give every Fastify request its own NexusDI scope, disposed when the response is done.**

A request-scoped service needs a scope per request, disposed when the reply is finished or the client is gone. Fastify's `onResponse` hook fires on `finish` only, so a client that disconnects mid-reply leaks the scope it used.

## How the scope follows the request

`di.plugin` registers an `onRequest` hook that attaches a scope handle to the request. The first `di.inject` handler creates the scope and resolves its typed deps from it. The raw response's `close` event disposes it, once, for a finished reply and for an aborted one. Register `di.encapsulatedPlugin` instead to scope only one encapsulated context.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/fastify@next @nexusdi/core@next fastify
```

## Quick Example

Each request gets its own flight log, so two requests never see each other's entries.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship);

const bridge = Fastify();
await bridge.register(di.plugin);
bridge.get<{ Params: { to: string } }>(
  '/course/:to',
  di.inject({ log: FLIGHT_LOG }, ({ log }, req) => {
    log.record(`plotting ${req.params.to}`);
    return log.entries();
  }),
);

await bridge.inject({ url: '/course/Kepler-442b' });
const res = await bridge.inject({ url: '/course/Gliese-667' });
res.json(); // -> ['plotting Gliese-667']
await bridge.close();
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Scope a Fastify request](https://nexus.js.org/next/fastify/)
- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/fastify/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
````

`/fastify/` goes live in Task 25; link `/scopes/` only until then if the `documentation` rule refuses it.

`libs/fastify/docs/examples.md`:

````md
# @nexusdi/fastify examples

## A route test with a testing container

`fastify.inject()` reaches the route in process, so the test opens no port. The server entry registers `ship[Symbol.asyncDispose]()` as an `onClose` hook, which Fastify runs after in-flight requests drain.

```ts @import.meta.vitest
import { defineModule, provide, Token } from '@nexusdi/core';
import { nexus, type ContainerSource } from '@nexusdi/fastify';
import { createTestingContainer } from '@nexusdi/testing';
import Fastify from 'fastify';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 0 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
  exports: [NAV_CHARTS],
});

async function createBridge(ship: ContainerSource) {
  const di = nexus(ship);
  const bridge = Fastify();
  await bridge.register(di.plugin);
  bridge.get<{ Params: { to: string } }>(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS }, ({ charts }, req) =>
      charts.plot(req.params.to),
    ),
  );
  return bridge;
}

const ship = await createTestingContainer(Tactical)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const bridge = await createBridge(ship);
const res = await bridge.inject({ url: '/course/Kepler-442b' });
res.json(); // -> { to: 'Kepler-442b', heading: 42 }
await bridge.close();
await ship[Symbol.asyncDispose]();
```
````

- [ ] **Step 4: Run the package and the README checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/fastify @nexusdi/repo-checks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/fastify tools/repo-checks/src/npm-readmes-data.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(fastify): run the plugin on a real server and add the README

The integration tests cover streamed replies, a client abort that
onResponse misses, lazy sections with and without an ambient scope, a
drained close, and error bodies with no core text and no code field.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Hono middleware, dispose-with-body.ts and keepAlive

Files:

- Create: `libs/hono/` (generator), `libs/hono/src/internal/request-scope.ts` (byte copy from `libs/express`), `libs/hono/src/internal/dispose-with-body.ts`, `libs/hono/src/internal/dispose-with-body.test.ts`, `libs/hono/src/nexus.ts`, `libs/hono/src/nexus.test.ts`, `libs/hono/src/nexus.test-d.ts`, `libs/hono/src/index.ts`, `libs/hono/docs/examples.md`
- Modify: `libs/hono/package.json`, `libs/hono/project.json`, `libs/hono/tsconfig*.json`, `libs/hono/vite.config.ts`, `commitlint.config.js` (scope `hono`), `.fallowrc.jsonc` (`publicPackages`), `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES`)

Interfaces:

- Consumes (Task 1, `request-scope.ts`): `ContainerSource`, `containerOf`, `requestScope`, `ClosableRequestScope`, `RequestScope`, `NexusLog`, `LogPhase`, `defaultLog`, `toHttpError`, `once`, `loader`, `validator`, `validateNow`.
- Produces: `disposeWithBody(response: Response, dispose: () => Promise<void>, method: string): Response` (copied by Task 9); `nexus(ship: ContainerSource, options: NexusHonoOptions): NexusHono`; `type NexusEnv = { Variables: { nexus: RequestScope } }`; `type NexusHonoOptions`; `interface NexusHono { middleware: MiddlewareHandler<NexusEnv>; inject; scope(c: Context): Promise<Scope>; load(module: ModuleRef): MiddlewareHandler<NexusEnv> & { inject } }`; `keepAlive(c: Context, done: Promise<void>): Promise<void>` (internal to `nexus.ts`).

Note on `validateNow`: with a `Nexus` source, `inject` must validate when it is called (spec 3.3), which the header's `validator` (first-request check) does not cover. This task consumes `validateNow(source: ContainerSource, deps: DepsMap, log: NexusLog, adapter: string): void` from `request-scope.ts`: for a `Nexus` it calls `ship.validate(deps)`, logs the error once with phase `validate`, and rethrows; for a function it does nothing. Task 1 must export it. If Task 1 has not, add it to `libs/express/src/internal/request-scope.ts` first, then copy.

- [ ] Step 1: Scaffold

```bash
cd /path/to/worktree
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/hono --name=@nexusdi/hono --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
rm -rf libs/hono/src/lib
mkdir -p libs/hono/src/internal libs/hono/docs
cp libs/express/src/internal/request-scope.ts libs/hono/src/internal/request-scope.ts
cmp libs/express/src/internal/request-scope.ts libs/hono/src/internal/request-scope.ts
```

Restore any `nx.json` comment the generator dropped (`git checkout nx.json`, then re-apply only functional additions). Copy `libs/node/project.json`, `libs/node/tsconfig.json`, `libs/node/tsconfig.lib.json`, `libs/node/tsconfig.spec.json`, `libs/node/eslint.config.mjs` and `libs/node/vite.config.ts` over the generated files, then replace `node` with `hono` in `name`, `cacheDir` and `test.name`. In `tsconfig.lib.json` and `tsconfig.spec.json` set `"lib": ["es2022", "dom", "dom.iterable", "esnext.disposable"]` (Hono's types use `Request`, `Response` and `ReadableStream`) and keep `"types": ["node"]` only in `tsconfig.spec.json`. Copy `libs/node/LICENSE`. Set `libs/hono/package.json`:

```json
{
  "name": "@nexusdi/hono",
  "version": "0.4.0-rc.1",
  "description": "Scope every Hono request with NexusDI, on Node, Workers, Deno and Bun.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "hono",
    "hono-middleware",
    "cloudflare-workers",
    "typescript"
  ],
  "homepage": "https://github.com/NexusDI/core#readme",
  "bugs": { "url": "https://github.com/NexusDI/core/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/hono"
  },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22.12" },
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "@nexusdi/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/**/*.tsbuildinfo",
    "src",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/*.test-d.*",
    "!src/**/__fixtures__/**",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "peerDependencies": { "@nexusdi/core": "0.4.0-rc.1", "hono": "^4.0.0" },
  "devDependencies": {
    "@hono/node-server": "2.1.5",
    "@nexusdi/devtools": "0.4.0-rc.1",
    "@nexusdi/errors": "0.4.0-rc.1",
    "@nexusdi/node": "0.4.0-rc.1",
    "hono": "4.13.13"
  },
  "publishConfig": { "access": "public", "provenance": true }
}
```

Add `'hono'` to the Nx-project block of `scope-enum` in `commitlint.config.js`, `"@nexusdi/hono"` to `.fallowrc.jsonc` `publicPackages`, and an `@nexusdi/hono` entry to `PACKAGES` in `tools/repo-checks/src/npm-readmes-data.ts` shaped like the `@nexusdi/node` entry (kind `platform`). Run `npm install` at the root.

- [ ] Step 2: Write the failing test `libs/hono/src/internal/dispose-with-body.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';

import { disposeWithBody } from './dispose-with-body.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('disposeWithBody', () => {
  it('disposes once the consumer has read the whole body', async () => {
    const dispose = vi.fn(async () => {});
    const res = disposeWithBody(
      new Response(streamOf('a', 'b')),
      dispose,
      'GET',
    );
    expect(dispose).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ab');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the status and the headers', () => {
    const res = disposeWithBody(
      new Response('x', {
        status: 201,
        headers: { 'x-mission-id': 'survey-7' },
      }),
      async () => {},
      'GET',
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('x-mission-id')).toBe('survey-7');
  });

  it('disposes when the consumer cancels the body', async () => {
    const dispose = vi.fn(async () => {});
    const res = disposeWithBody(new Response(streamOf('a')), dispose, 'GET');
    await res.body!.cancel('client gone');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes when the original body errors', async () => {
    const dispose = vi.fn(async () => {});
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('relay lost'));
      },
    });
    const res = disposeWithBody(new Response(failing), dispose, 'GET');
    await expect(res.text()).rejects.toThrow('relay lost');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a null body', new Response(null), 'GET'],
    ['a HEAD request', new Response('x'), 'HEAD'],
    ['a 204', new Response(null, { status: 204 }), 'GET'],
    ['a 304', new Response(null, { status: 304 }), 'GET'],
  ])(
    'disposes at once and returns the same response for %s',
    (_, response, method) => {
      const dispose = vi.fn(async () => {});
      expect(disposeWithBody(response, dispose, method)).toBe(response);
      expect(dispose).toHaveBeenCalledTimes(1);
    },
  );
});
```

- [ ] Step 3: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/hono`
Expected: FAIL, cannot find `./dispose-with-body.js`.

- [ ] Step 4: Implement `libs/hono/src/internal/dispose-with-body.ts`

```ts
/**
 * The body wrapper of integrations spec 3.4. A framework that returns the
 * Response before it writes the body (Hono, React Router) disposes the
 * request's scope here: when the body ends, errors or is cancelled. A
 * response with no body to read disposes at once and is returned as is.
 */
const NO_BODY = new Set([101, 204, 205, 304]);

export function disposeWithBody(
  response: Response,
  dispose: () => Promise<void>,
  method: string,
): Response {
  if (
    response.body === null ||
    method === 'HEAD' ||
    NO_BODY.has(response.status)
  ) {
    void dispose();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          void dispose();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        void dispose();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        void dispose();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
```

`dispose` is the adapter's `once` wrapper, so the three calls reach core at most once. The function never awaits `dispose`: the response is already on its way, and the adapter's `once` passes a disposal error to `log`.

- [ ] Step 5: Write the failing test `libs/hono/src/nexus.test.ts`

```ts
import {
  defineModule,
  errorBase,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nexus } from './nexus.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavRoutes {
  find(sector: string): string;
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
const UNCHARTED = new Token<string>('Uncharted');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});

const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, {
      useValue: { find: (sector: string) => `route to ${sector}` },
    }),
  ],
  exports: [NAV_ROUTES],
});

const survey = (c: { req: { header(name: string): string | undefined } }) => ({
  mission: {
    id: c.req.header('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const ships: Nexus[] = [];
async function ship(events: TraceEvent[] = [], plugins: NexusPlugin[] = []) {
  const built = await Nexus.create(
    defineModule({ name: 'Meridian', imports: [BridgeApi] }),
    {
      plugins: [trace((event) => events.push(event)), ...plugins],
    },
  );
  ships.push(built);
  return built;
}
afterEach(async () => {
  await Promise.all(ships.splice(0).map((s) => s[Symbol.asyncDispose]()));
});

const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((event) => event.type === type).length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('nexus() for Hono', () => {
  it('creates one scope per request and disposes it after the body', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => {
        log.record('arrived');
        return c.json(log.entries());
      }),
    );
    const res = await app.request('/log', {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual(['survey-9: arrived']);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('creates no scope and never maps the request when nothing resolves', async () => {
    const events: TraceEvent[] = [];
    const request = vi.fn(survey);
    const di = nexus(await ship(events), { request });
    const app = new Hono()
      .use(di.middleware)
      .get('/ping', (c) => c.text('pong'));
    expect(await (await app.request('/ping')).text()).toBe('pong');
    await settle();
    expect(request).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('keeps the scope open while a stream reads a scoped instance', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
        stream(c, async (s) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          log.record('late entry');
          await s.write(log.entries().join(','));
        }),
      ),
    );
    const res = await app.request('/stream');
    expect(count(events, 'scope:dispose')).toBe(0);
    expect(await res.text()).toBe('survey-7: late entry');
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('disposes once when the consumer cancels the stream', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, (_, c) =>
        stream(c, async (s) => {
          await s.write('first');
          await new Promise((resolve) => setTimeout(resolve, 50));
          await s.write('second');
        }),
      ),
    );
    const res = await app.request('/stream');
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel('client gone');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('ends a request whose client left before the middleware ran', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey });
    const handler = vi.fn();
    const app = new Hono().use(di.middleware).get('/log', handler);
    const res = await app.request(
      new Request('http://bridge/log', { signal: AbortSignal.abort() }),
    );
    expect(res.status).toBe(499);
    expect(handler).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('answers 503 while a function-form build fails, then retries', async () => {
    const built = await ship();
    const source = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(new Error('charts unreachable'))
      .mockResolvedValue(built);
    const log = vi.fn();
    const di = nexus(source, { request: survey, log });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log: l }, c) => c.json(l.entries())),
    );
    expect((await app.request('/log')).status).toBe(503);
    expect((await app.request('/log')).status).toBe(200);
    expect(source).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'build', status: 503 }),
    );
  });

  it('answers 500 with no core text when the request mapping misses a field', async () => {
    const di = nexus(await ship(), {
      request: () => undefined as unknown as NexusRequest,
      log: () => {},
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const res = await app.request('/log');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('NEXUS_');
  });

  it('answers 500 for a third-party code a construct hook throws', async () => {
    class SensorOfflineError extends errorBase<
      'MERIDIAN_SENSOR_OFFLINE',
      { sensor: string }
    >('MERIDIAN_SENSOR_OFFLINE', 'SensorOfflineError') {}
    const sensors: NexusPlugin = {
      name: 'meridian-sensors',
      apiVersion: 1,
      construct(_, provider, scope) {
        if (scope !== null)
          throw new SensorOfflineError({ sensor: provider.id });
        return undefined;
      },
    };
    const di = nexus(await ship([], [sensors]), {
      request: survey,
      log: () => {},
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const res = await app.request('/log');
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('MERIDIAN_');
  });

  it('answers 503 once the container is disposed', async () => {
    const built = await ship();
    const di = nexus(built, { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    await built[Symbol.asyncDispose]();
    expect((await app.request('/log')).status).toBe(503);
  });

  it('throws at definition for a token with no provider, and logs it once', async () => {
    const log = vi.fn();
    const di = nexus(await ship(), { request: survey, log });
    expect(() =>
      di.inject({ route: NAV_ROUTES }, (_, c) => c.text('x')),
    ).toThrow(/NEXUS_BLUEPRINT_INVALID/);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'validate' }),
    );
  });

  it('rejects di.scope without the middleware', async () => {
    const di = nexus(await ship(), { request: survey });
    const app = new Hono().get('/raw', async (c) => {
      await di.scope(c);
      return c.text('unreachable');
    });
    app.onError((error, c) => c.text(String(error.message), 500));
    expect(await (await app.request('/raw')).text()).toBe(
      '[@nexusdi/hono] no scope on this request: register di.middleware before this route',
    );
  });

  it('hands the disposal to executionCtx.waitUntil where the platform has one', async () => {
    const di = nexus(await ship(), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const waitUntil = vi.fn();
    const res = await app.request(
      '/log',
      {},
      {},
      { waitUntil, passThroughOnException() {}, props: {} },
    );
    await res.text();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('runs the rest of the request inside scopes.run when scopes is set', async () => {
    const seen: string[] = [];
    let current: { id: string } | undefined;
    const scopes = {
      run<R>(scope: { id: string }, fn: () => R): R {
        current = scope;
        seen.push(scope.id);
        return fn();
      },
    };
    const di = nexus(await ship(), { request: survey, scopes, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, async (_, c) => {
        const scope = await di.scope(c);
        return c.text(String(scope.id === current?.id));
      }),
    );
    expect(await (await app.request('/log')).text()).toBe('true');
    expect(seen).toHaveLength(1);
  });

  it('serves the first request into a lazily loaded section', async () => {
    const events: TraceEvent[] = [];
    const built = await ship(events);
    const di = nexus(built, { request: survey, log: () => {} });
    const navigation = di.load(Navigation);
    const section = new Hono<{ Variables: { nexus: never } }>()
      .use(navigation)
      .get(
        '/:sector',
        navigation.inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
          c.text(routes.find(c.req.param('sector'))),
        ),
      );
    const app = new Hono().use(di.middleware).route('/nav', section);
    expect(await (await app.request('/nav/kepler')).text()).toBe(
      'route to kepler',
    );
    expect(await (await app.request('/nav/vega')).text()).toBe('route to vega');
    expect(count(events, 'scope:extend')).toBe(0);
  });

  it('extends a scope created before the section loaded', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const navigation = di.load(Navigation);
    const app = new Hono()
      .use(di.middleware)
      .use(async (c, next) => {
        (await di.scope(c)).get(FLIGHT_LOG).record('early');
        await next();
      })
      .use(navigation)
      .get(
        '/nav/:sector',
        navigation.inject(
          { routes: NAV_ROUTES, log: FLIGHT_LOG },
          ({ routes, log }, c) =>
            c.json({
              route: routes.find(c.req.param('sector')),
              log: log.entries(),
            }),
        ),
      );
    expect(await (await app.request('/nav/kepler')).json()).toEqual({
      route: 'route to kepler',
      log: ['survey-7: early'],
    });
    expect(count(events, 'scope:extend')).toBe(1);
  });

  it('shares one scope between two first uses in one request', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get('/both', async (c) => {
      const [a, b] = await Promise.all([di.scope(c), di.scope(c)]);
      return c.text(String(a === b));
    });
    expect(await (await app.request('/both')).text()).toBe('true');
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('defers a section inject check until the section has loaded', async () => {
    const di = nexus(await ship(), { request: survey, log: () => {} });
    expect(() =>
      di.load(Navigation).inject({ x: UNCHARTED }, (_, c) => c.text('x')),
    ).not.toThrow();
  });
});
```

The last case pins spec 3.9: `di.load(...).inject` validates after the first load, so a section's route module can be evaluated before its module is loaded.

- [ ] Step 6: Write the failing type test `libs/hono/src/nexus.test-d.ts`

```ts
import { Nexus, optional, lazy, Token, type Scope } from '@nexusdi/core';
import { Hono } from 'hono';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus, type RequestScope } from './index.js';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const RELAY = new Token<string>('Relay');

declare const ship: Nexus;
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

describe('@nexusdi/hono types', () => {
  it('types the inject record from core deps', () => {
    di.inject(
      { log: FLIGHT_LOG, relay: optional(RELAY), later: lazy(FLIGHT_LOG) },
      (deps, c) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(deps.relay).toEqualTypeOf<string | undefined>();
        expectTypeOf(deps.later).toEqualTypeOf<() => IFlightLog>();
        return c.text('ok');
      },
    );
  });

  it('types c.var.nexus after chaining the middleware', () => {
    new Hono().use(di.middleware).get('/', (c) => {
      expectTypeOf(c.var.nexus).toEqualTypeOf<RequestScope>();
      return c.text('ok');
    });
  });

  it('returns the request scope from di.scope', () => {
    new Hono().get('/', async (c) => {
      expectTypeOf(await di.scope(c)).toEqualTypeOf<Scope>();
      return c.text('ok');
    });
  });

  it('requires the request mapping when NexusRequest has a required field', () => {
    // @ts-expect-error: the test-support augmentation makes `mission` required
    nexus(ship, {});
  });
});
```

Both test files need `NexusRequest` augmented with a required `mission` field. The augmentation lives in `libs/hono/test-support/nexus-request.ts`; add `"test-support/**/*.ts"` to `tsconfig.spec.json` `include`:

```ts
// libs/hono/test-support/nexus-request.ts
import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
```

Add `"libs/hono/test-support/nexus-request.ts"` to `.fallowrc.jsonc` `entry` beside `libs/core/test-support/nexus-request.ts`.

- [ ] Step 7: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/hono`
Expected: FAIL, cannot find `./nexus.js` and `./index.js`.

- [ ] Step 8: Implement `libs/hono/src/nexus.ts`

```ts
import type {
  DepsMap,
  ModuleRef,
  NexusRequest,
  ResolvedDeps,
  Scope,
} from '@nexusdi/core';
import type { Context, Handler, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { disposeWithBody } from './internal/dispose-with-body.js';
import {
  type ContainerSource,
  containerOf,
  defaultLog,
  loader,
  type LogPhase,
  type NexusLog,
  once,
  type RequestOption,
  type RequestScope,
  requestScope,
  type ScopeRunner,
  toHttpError,
  validateNow,
  validator,
} from './internal/request-scope.js';

const ADAPTER = '@nexusdi/hono';

export type NexusEnv = { Variables: { nexus: RequestScope } };

// ScopeRunner and RequestOption come from the shared request-scope.ts (Task 1).
export type { ScopeRunner } from './internal/request-scope.js';

export type NexusHonoOptions = RequestOption<Context> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

type Inject = <const D extends DepsMap>(
  deps: D,
  handler: (
    deps: ResolvedDeps<D>,
    c: Context<NexusEnv>,
  ) => Response | Promise<Response>,
) => Handler<NexusEnv>;

export interface NexusHono {
  readonly middleware: MiddlewareHandler<NexusEnv>;
  readonly inject: Inject;
  scope(c: Context): Promise<Scope>;
  load(
    module: ModuleRef,
  ): MiddlewareHandler<NexusEnv> & { readonly inject: Inject };
}

/** Hands the disposal to the platform's waitUntil where one exists (spec D5). */
function keepAlive(c: Context, done: Promise<void>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx; // throws on Node, Bun and Deno: no execution context
  } catch {
    ctx = undefined;
  }
  ctx?.waitUntil(done);
  return done;
}

export function nexus(
  ship: ContainerSource,
  options: NexusHonoOptions,
): NexusHono {
  const container = containerOf(ship);
  const log = options.log ?? defaultLog;
  const load = loader(container);

  const fail = (error: unknown, phase: LogPhase): never => {
    const http = toHttpError(error, log, ADAPTER, phase);
    throw new HTTPException(http.status, {
      message: http.message,
      cause: http.cause,
    });
  };

  const handleOf = (c: Context): RequestScope => {
    const handle = (c as Context<NexusEnv>).get('nexus') as
      RequestScope | undefined;
    if (handle === undefined)
      throw new Error(
        `[${ADAPTER}] no scope on this request: register di.middleware before this route`,
      );
    return handle;
  };

  const middleware = createMiddleware<NexusEnv>(async (c, next) => {
    const handle = requestScope(container, () => options.request?.(c));
    const dispose = once(() =>
      keepAlive(
        c,
        handle
          .close()
          .catch((error: unknown) =>
            log(error, { adapter: ADAPTER, phase: 'dispose' }),
          ),
      ),
    );
    if (c.req.raw.signal.aborted) {
      await dispose(); // the client left before the middleware ran: no scope, no handler
      return new Response(null, { status: 499 }); // nobody reads it; Hono needs a response
    }
    c.req.raw.signal.addEventListener('abort', () => void dispose(), {
      once: true,
    });
    c.set('nexus', handle);
    if (options.scopes) {
      let scope: Scope;
      try {
        scope = await handle.scope();
      } catch (error) {
        await dispose();
        return fail(error, 'scope');
      }
      await options.scopes.run(scope, next);
    } else {
      await next(); // inject creates the scope on first use
    }
    const wrapped = disposeWithBody(c.res, dispose, c.req.method);
    if (wrapped !== c.res) {
      c.res = undefined; // replace, so Hono does not merge the old headers twice
      c.res = wrapped;
    }
  });

  const injectWith =
    (check: () => Promise<void>): Inject =>
    (deps, handler) =>
    async (c) => {
      try {
        await check();
      } catch (error) {
        return fail(error, 'validate');
      }
      let resolved: ResolvedDeps<typeof deps>;
      try {
        resolved = (await handleOf(c).scope()).resolve(deps);
      } catch (error) {
        return fail(error, 'scope');
      }
      return handler(resolved, c as Context<NexusEnv>);
    };

  const inject: Inject = (deps, handler) => {
    validateNow(ship, deps, log, ADAPTER); // a Nexus source fails here, at route definition
    return injectWith(validator(container, deps))(deps, handler);
  };

  return {
    middleware,
    inject,
    async scope(c) {
      try {
        return await handleOf(c).scope();
      } catch (error) {
        return fail(error, 'scope');
      }
    },
    load(module) {
      const section = createMiddleware<NexusEnv>(async (c, next) => {
        try {
          await load(module);
          const handle = c.get('nexus') as RequestScope | undefined;
          if (handle?.started) await (await handle.scope()).extend();
        } catch (error) {
          return fail(error, 'load');
        }
        await next();
      });
      const sectionInject: Inject = (deps, handler) =>
        injectWith(validator(() => load(module), deps))(deps, handler);
      return Object.assign(section, { inject: sectionInject });
    },
  };
}
```

`libs/hono/src/index.ts`:

```ts
export { nexus } from './nexus.js';
export type {
  NexusEnv,
  NexusHono,
  NexusHonoOptions,
  ScopeRunner,
} from './nexus.js';
export type {
  ContainerSource,
  LogContext,
  LogPhase,
  NexusLog,
  RequestScope,
} from './internal/request-scope.js';
```

`libs/hono/docs/examples.md`: one `ts @import.meta.vitest` fence with the README Getting started of spec 3.8, ending in a `// -> 'Hello, crew'` claim on `await (await app.request('/')).text()`.

- [ ] Step 9: Run the tests, the type tests, lint and the repo checks

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/hono @nexusdi/repo-checks`
Expected: PASS. `core-layers` passes with no edit (no `node:` import, no `process` in `libs/hono/src`). `no-copies` passes: the `request-scope.ts` glob added in Task 5 now spans three packages.

- [ ] Step 10: Commit

```bash
git add libs/hono commitlint.config.js .fallowrc.jsonc tools/repo-checks/src/npm-readmes-data.ts package.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(hono): scope each Hono request and dispose it with the body

The middleware gives each request a lazy scope handle, wraps the response
body so the scope ends when the body ends, errors or is cancelled, and
hands that disposal to executionCtx.waitUntil on Workers. inject resolves
a typed deps record and checks it when the route is defined.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Hono integration tests, README and the edge-safe check

Files:

- Create: `libs/hono/src/hono.e2e.test.ts`, `libs/hono/README.md`, `libs/hono/CHANGELOG.md`, `tools/repo-checks/src/edge-safe.ts`, `tools/repo-checks/src/edge-safe.test.ts`, `tools/repo-checks/src/__fixtures__/edge-safe/clean/libs/core/src/index.ts`, `tools/repo-checks/src/__fixtures__/edge-safe/sabotaged/libs/hono/src/index.ts`, `tools/repo-checks/src/__fixtures__/edge-safe/sabotaged/libs/hono/src/index.test.ts`
- Modify: `libs/hono/vite.config.ts` (include `src/**/*.e2e.test.ts`)

Interfaces:

- Consumes: `nexus`, `NexusEnv` (Task 7); `nodeScopes` from `@nexusdi/node`; `trace` from `@nexusdi/devtools`; `errors` from `@nexusdi/errors`.
- Produces: `edgeSafe(root: string): { violations: string[]; scanned: { packages: number; files: number } }` and `EDGE_PACKAGES: readonly string[]` (`['core', 'node', 'errors', 'hono', 'react-router', 'next']`), which Task 17 relies on for `libs/next`.

- [ ] Step 1: Write the failing check test `tools/repo-checks/src/edge-safe.test.ts`

```ts
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { EDGE_PACKAGES, edgeSafe } from './edge-safe.js';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'edge-safe');

describe('edgeSafe', () => {
  it('names the packages that claim edge support', () => {
    expect(EDGE_PACKAGES).toEqual([
      'core',
      'node',
      'errors',
      'hono',
      'react-router',
      'next',
    ]);
  });

  it('accepts sources with neither eval nor new Function, and skips absent packages', () => {
    const result = edgeSafe(join(FIXTURES, 'clean'));
    expect(result.violations).toEqual([]);
    expect(result.scanned.packages).toBe(1);
  });

  it('reports eval( and new Function in sources, and ignores tests', () => {
    expect(edgeSafe(join(FIXTURES, 'sabotaged')).violations).toEqual([
      'libs/hono/src/index.ts:1 calls eval(; Vercel Edge disables it',
      'libs/hono/src/index.ts:2 calls new Function; Vercel Edge disables it',
    ]);
  });

  const live = edgeSafe(workspaceRoot);

  it('scans every edge package present in libs/', () => {
    expect(live.scanned.packages).toBeGreaterThanOrEqual(4);
    expect(live.scanned.files).toBeGreaterThan(0);
  });

  it('holds for the workspace', () => {
    expect(live.violations).toEqual([]);
  });
});
```

Fixtures:

```ts
// tools/repo-checks/src/__fixtures__/edge-safe/clean/libs/core/src/index.ts
export const evaluate = (value: string) => value.length; // the word eval in a name is fine
```

```ts
// tools/repo-checks/src/__fixtures__/edge-safe/sabotaged/libs/hono/src/index.ts
export const a = eval('1');
export const b = new Function('return 2');
```

```ts
// tools/repo-checks/src/__fixtures__/edge-safe/sabotaged/libs/hono/src/index.test.ts
export const c = eval('3');
```

- [ ] Step 2: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- edge-safe`
Expected: FAIL, cannot find `./edge-safe.js`.

- [ ] Step 3: Implement `tools/repo-checks/src/edge-safe.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder, TEST_FILE } from './entry-graph.js';

/**
 * Vercel Edge disables eval and new Function (integrations spec 9.6, D8).
 * The packages that claim edge support may hold neither in their source.
 * Tests are exempt; a package folder that does not exist yet is skipped.
 */
export const EDGE_PACKAGES = [
  'core',
  'node',
  'errors',
  'hono',
  'react-router',
  'next',
] as const;

export interface EdgeSafe {
  readonly violations: string[];
  readonly scanned: { readonly packages: number; readonly files: number };
}

export function edgeSafe(root: string): EdgeSafe {
  const violations: string[] = [];
  let packages = 0;
  let files = 0;
  for (const name of EDGE_PACKAGES) {
    const src = join(root, 'libs', name, 'src');
    const sources = filesUnder(src).filter(
      (path) => /\.tsx?$/.test(path) && !TEST_FILE.test(path),
    );
    if (sources.length === 0) continue;
    packages += 1;
    for (const path of sources) {
      files += 1;
      const text = readFileSync(join(src, path), 'utf8');
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const where = `libs/${name}/src/${path}`;
      const visit = (node: ts.Node): void => {
        const line = () =>
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'eval'
        )
          violations.push(
            `${where}:${line()} calls eval(; Vercel Edge disables it`,
          );
        if (
          (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'Function'
        )
          violations.push(
            `${where}:${line()} calls new Function; Vercel Edge disables it`,
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return { violations, scanned: { packages, files } };
}
```

- [ ] Step 4: Run it and see it pass

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- edge-safe`
Expected: PASS.

- [ ] Step 5: Write the failing integration test `libs/hono/src/hono.e2e.test.ts`

```ts
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { serve, type ServerType } from '@hono/node-server';
import {
  defineModule,
  errorBase,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { afterEach, describe, expect, it } from 'vitest';

import { nexus, type NexusHonoOptions } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavRoutes {
  find(sector: string): string;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (r: NexusRequest) => r.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});
const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, { useValue: { find: (s: string) => `route to ${s}` } }),
  ],
  exports: [NAV_ROUTES],
});

const request: NexusHonoOptions['request'] = (c) => ({
  mission: {
    id: c.req.header('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const open: { server: ServerType; ship: Nexus }[] = [];
afterEach(async () => {
  for (const { server, ship } of open.splice(0)) {
    server.close();
    await once(server, 'close');
    await ship[Symbol.asyncDispose]();
  }
});

async function start(
  build: (di: ReturnType<typeof nexus>) => Hono,
  extra: Partial<NexusHonoOptions> = {},
  plugins: NexusPlugin[] = [],
) {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(Meridian, {
    plugins: [errors(), trace((event) => events.push(event)), ...plugins],
  });
  const di = nexus(ship, {
    request,
    log: () => {},
    ...extra,
  } as NexusHonoOptions);
  const server = serve({ fetch: build(di).fetch, port: 0 });
  await once(server, 'listening');
  open.push({ server, ship });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, events };
}

const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((e) => e.type === type).length;
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe('@nexusdi/hono on @hono/node-server', () => {
  it('disposes a JSON response scope after the body is sent', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) => {
          log.record('arrived');
          return c.json(log.entries());
        }),
      ),
    );
    expect(await (await fetch(`${url}/log`)).json()).toEqual([
      'survey-7: arrived',
    ]);
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('keeps the scope open until an SSE stream closes', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/feed',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
          streamSSE(c, async (s) => {
            for (const n of [1, 2, 3]) {
              await new Promise((r) => setTimeout(r, 20));
              log.record(`ping ${n}`);
              await s.writeSSE({ data: log.entries().join('|') });
            }
          }),
        ),
      ),
    );
    const text = await (await fetch(`${url}/feed`)).text();
    expect(text).toContain(
      'survey-7: ping 1|survey-7: ping 2|survey-7: ping 3',
    );
    expect(text).not.toContain('NEXUS_DISPOSED');
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('disposes the scope when the client aborts mid-stream', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/feed',
        di.inject({ log: FLIGHT_LOG }, (_, c) =>
          streamSSE(c, async (s) => {
            for (;;) {
              await s.writeSSE({ data: 'tick' });
              await new Promise((r) => setTimeout(r, 20));
              if (s.aborted) return;
            }
          }),
        ),
      ),
    );
    const controller = new AbortController();
    const res = await fetch(`${url}/feed`, { signal: controller.signal });
    await res.body!.getReader().read();
    controller.abort();
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('disposes the scope and answers 500 when a handler throws', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/fail',
        di.inject({ log: FLIGHT_LOG }, () => {
          throw new Error('sector not charted');
        }),
      ),
    );
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('answers 500 with no NEXUS_ in the body for a third-party construct code', async () => {
    class SensorOfflineError extends errorBase<
      'MERIDIAN_SENSOR_OFFLINE',
      { sensor: string }
    >('MERIDIAN_SENSOR_OFFLINE', 'SensorOfflineError') {}
    const sensors: NexusPlugin = {
      name: 'meridian-sensors',
      apiVersion: 1,
      construct(_, provider, scope) {
        if (scope !== null)
          throw new SensorOfflineError({ sensor: provider.id });
        return undefined;
      },
    };
    const { url } = await start(
      (di) =>
        new Hono().use(di.middleware).get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
        ),
      {},
      [sensors],
    );
    const res = await fetch(`${url}/log`);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('FlightLog');
  });

  it('gives 50 concurrent requests 50 scopes and no shared scoped instance', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, async ({ log }, c) => {
          log.record('in');
          await new Promise((r) => setTimeout(r, 5));
          return c.json(log.entries());
        }),
      ),
    );
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${url}/log`, {
          headers: { 'x-mission-id': `survey-${i}` },
        }).then((r) => r.json()),
      ),
    );
    bodies.forEach((body, i) => expect(body).toEqual([`survey-${i}: in`]));
    await until(() => count(events, 'scope:dispose') === 50);
    expect(count(events, 'scope:create')).toBe(50);
  });

  it('makes scopes.current() return the request scope inside a service call', async () => {
    const scopes = nodeScopes();
    const logArrival = () =>
      scopes.current()?.get(FLIGHT_LOG).record('arrived');
    const { url } = await start(
      (di) =>
        new Hono().use(di.middleware).get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, async ({ log }, c) => {
            await new Promise((r) => setTimeout(r, 1));
            logArrival();
            return c.json(log.entries());
          }),
        ),
      { scopes },
    );
    expect(await (await fetch(`${url}/log`)).json()).toEqual([
      'survey-7: arrived',
    ]);
  });

  it('serves the first request into a lazy section with scopes set, extending the scope once', async () => {
    const scopes = nodeScopes();
    const ids: string[] = [];
    const { url, events } = await start(
      (di) => {
        const navigation = di.load(Navigation);
        return new Hono()
          .use(di.middleware)
          .use(async (c, next) => {
            ids.push(scopes.current()!.id);
            await next();
            ids.push(scopes.current()!.id);
          })
          .use(navigation)
          .get(
            '/nav/:sector',
            navigation.inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
              c.text(routes.find(c.req.param('sector'))),
            ),
          );
      },
      { scopes },
    );
    expect(await (await fetch(`${url}/nav/kepler`)).text()).toBe(
      'route to kepler',
    );
    expect(count(events, 'scope:create')).toBe(1);
    const extend = events.filter((e) => e.type === 'scope:extend');
    expect(extend).toHaveLength(1);
    expect(extend[0]).toMatchObject({ modules: ['Navigation'] });
    expect(new Set(ids).size).toBe(1);
  });
});
```

Add `'src/**/*.e2e.test.ts'` to `test.include` in `libs/hono/vite.config.ts` (the pattern `src/**/*.{test,spec}.ts` already matches `hono.e2e.test.ts`; check with `npx vitest list` and add nothing if it is listed).

- [ ] Step 6: Run it

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/hono`
Expected: PASS. A failure in "aborts mid-stream" means `@hono/node-server` did not abort `c.req.raw.signal`; check that the wrapper's `cancel` ran (spec 4.2) before changing the middleware.

- [ ] Step 7: Write the README `libs/hono/README.md`

The README follows `docs/documentation-style-guide.md` and the npm README rules in `tools/repo-checks/src/npm-readmes.ts` (title, badges, tagline, lead-in on the problem, an H2 on what the package is, the example, the install line, the documentation links, the licence). Content, in order:

1. `# @nexusdi/hono`, the badges `libs/node/README.md` uses (with `hono` in the URLs), the tagline "Scope every Hono request with NexusDI, on Node, Workers, Deno and Bun."
2. Lead-in: a Hono handler that streams keeps writing after `next()` returns, so a scope disposed after `next()` breaks the stream, and an aborted client leaks it.
3. `## What it does`: one scope per request on first use, typed `inject`, disposal at the end of the body or on abort, `waitUntil` on Workers.
4. `## Getting started`: the spec 3.8 Getting started block as a `ts @import.meta.vitest` fence, with `expect(await (await app.request('/?user=survey-7')).text()).toBe('Hello, survey-7'); // -> 'Hello, survey-7'`.
5. `## Typed handlers`, `## When the scope is disposed`, `## Errors`, `## Ambient scope`, `## Runtimes` (the table of spec 9.1 for Hono), `## Requirements` (peers and Node), each with interface-first examples from spec 4.1 and 4.7 using `app.request()`.
6. Install line: `npm i @nexusdi/core@next @nexusdi/hono hono` with the sentence from spec 12 on why core is named.
7. The docs links (`https://nexus.js.org/next/hono/`, `/edge/`, `/api-hono/`) and the licence.

`CHANGELOG.md`: copy the heading `libs/node/CHANGELOG.md` starts with and no entries (nx release writes them).

- [ ] Step 8: Run the README doctests and the README rules

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint -p @nexusdi/hono @nexusdi/repo-checks`
Expected: PASS, including `npm-readmes.test.ts` for `libs/hono/README.md` and every `ts` fence as a doctest.

- [ ] Step 9: Commit

```bash
git add libs/hono tools/repo-checks/src/edge-safe.ts tools/repo-checks/src/edge-safe.test.ts tools/repo-checks/src/__fixtures__/edge-safe
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(hono): run the adapter on a real server and add the edge-safe check

The integration suite covers SSE streams, client aborts, throwing
handlers, 50 concurrent requests, nodeScopes() and a lazy section on
@hono/node-server. edge-safe refuses eval and new Function in the
packages that claim edge support, because Vercel Edge disables both.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: React Router middleware and the second body wrapper copy

Files:

- Create: `libs/react-router/` (generator), `libs/react-router/src/internal/request-scope.ts` (byte copy), `libs/react-router/src/internal/dispose-with-body.ts` (byte copy), `libs/react-router/src/nexus.ts`, `libs/react-router/src/nexus.test.ts`, `libs/react-router/src/nexus.test-d.ts`, `libs/react-router/src/index.ts`, `libs/react-router/test-support/nexus-request.ts`, `libs/react-router/docs/examples.md`
- Modify: `libs/react-router/package.json`, `project.json`, `tsconfig*.json`, `vite.config.ts`, `commitlint.config.js` (scope `react-router`), `.fallowrc.jsonc` (`publicPackages`, `duplicates.ignore`, `entry`), `tools/repo-checks/src/no-copies.test.ts` (`ALLOWLIST`), `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES`)

Interfaces:

- Consumes: `request-scope.ts` (Task 1: `containerOf`, `requestScope`, `existingScope`, `defaultLog`, `toHttpError`, `once`, `loader`, `validator`, `validateNow`, the types); `disposeWithBody` (Task 7).
- Produces: `NEXUS_SCOPE: RouterContext<RequestScope>`; `existingScope(scope: Scope): RequestScope`; `nexus(ship: ContainerSource, options: NexusRouterOptions): NexusRouter` with `{ middleware: MiddlewareFunction<Response>; inject; scope(context: Readonly<RouterContextProvider>): Promise<Scope>; load(module: ModuleRef): MiddlewareFunction<Response> & { inject } }`; `type NexusRouterOptions` (`request`, `scopes`, `log`), where `request` takes `{ request: Request; params: Params }`. Task 10, Task 15 (react SSR) and Task 19 (`examples/react-ssr`) use these names.

- [ ] Step 1: Scaffold and copy

```bash
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/react-router --name=@nexusdi/react-router --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
rm -rf libs/react-router/src/lib
mkdir -p libs/react-router/src/internal libs/react-router/docs libs/react-router/test-support
cp libs/express/src/internal/request-scope.ts libs/react-router/src/internal/request-scope.ts
cp libs/hono/src/internal/dispose-with-body.ts libs/react-router/src/internal/dispose-with-body.ts
cp libs/hono/test-support/nexus-request.ts libs/react-router/test-support/nexus-request.ts
```

Align the config files with `libs/hono` (Task 7 Step 1), replacing `hono` with `react-router`. `package.json` as Task 7's, with:

```json
"description": "Scope every React Router request with NexusDI, from middleware to loaders.",
"keywords": ["nexusdi", "dependency injection", "react-router", "middleware", "ssr", "typescript"],
"repository": { "type": "git", "url": "git+https://github.com/NexusDI/core.git", "directory": "libs/react-router" },
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.1", "react-router": "^7.9.0 || ^8.0.0" },
"devDependencies": {
  "@nexusdi/devtools": "0.4.0-rc.1",
  "@nexusdi/errors": "0.4.0-rc.1",
  "@nexusdi/node": "0.4.0-rc.1",
  "@react-router/dev": "8.4.0",
  "@react-router/node": "8.4.0",
  "isbot": "^5.1.0",
  "react": "19.3.0",
  "react-dom": "19.3.0",
  "react-router": "8.4.0"
}
```

`react` and `react-dom` carry one version spec (`react-pair.test.ts`). Add `'react-router'` to `scope-enum`, `"@nexusdi/react-router"` to `publicPackages`, `"libs/react-router/test-support/nexus-request.ts"` to `entry`, and a `PACKAGES` entry. Run `npm install`.

- [ ] Step 2: Add the second copy's glob to both lists

In `.fallowrc.jsonc` `duplicates.ignore`, after the `request-scope.ts` glob that Task 5 added:

```jsonc
      // The body wrapper of integrations spec 3.4, one byte-identical copy
      // per adapter that returns its Response before the body is written
      // (Hono, React Router). P4's named exception (ruling V13);
      // adapter-shared-copies.test.ts holds the copies equal.
      "libs/*/src/internal/dispose-with-body.ts",
```

In `tools/repo-checks/src/no-copies.test.ts` `ALLOWLIST`:

```ts
  {
    glob: 'libs/*/src/internal/dispose-with-body.ts',
    reason: 'P4 exception: the adapter copies (integrations spec 3.7, ruling V13)',
  },
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- no-copies adapter-shared-copies`
Expected: PASS. "uses every allowance" passes because the glob now spans `libs/hono` and `libs/react-router`; `adapter-shared-copies` (Task 5) finds the two copies equal.

- [ ] Step 3: Write the failing test `libs/react-router/src/nexus.test.ts`

```ts
import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { RouterContextProvider, type MiddlewareFunction } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { existingScope, NEXUS_SCOPE, nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavRoutes {
  find(sector: string): string;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}
const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (r: NexusRequest) => r.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});
const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, { useValue: { find: (s: string) => `route to ${s}` } }),
  ],
  exports: [NAV_ROUTES],
});

const request = ({ request: r }: { request: Request }) => ({
  mission: {
    id: r.headers.get('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const ships: Nexus[] = [];
async function ship(events: TraceEvent[] = []) {
  const built = await Nexus.create(Meridian, {
    plugins: [trace((e) => events.push(e))],
  });
  ships.push(built);
  return built;
}
afterEach(async () => {
  await Promise.all(ships.splice(0).map((s) => s[Symbol.asyncDispose]()));
});
const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((e) => e.type === type).length;
const settle = () => new Promise((r) => setTimeout(r, 10));

/** Runs one middleware with a next() that calls `downstream`, the way React Router's chain does. */
async function run(
  middleware: MiddlewareFunction<Response>,
  downstream: (context: RouterContextProvider) => Promise<Response>,
  init: RequestInit = {},
) {
  const context = new RouterContextProvider();
  const req = new Request('http://bridge/course/Kepler-442b', init);
  const result = await middleware(
    {
      request: req,
      context,
      params: { to: 'Kepler-442b' },
      unstable_pattern: '/course/:to',
    } as never,
    () => downstream(context),
  );
  return { response: result as Response, context };
}

describe('nexus() for React Router', () => {
  it('resolves loader deps from the request scope and disposes at body end', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const loader = di.inject(
      { log: FLIGHT_LOG },
      (
        { log },
        {
          params,
        }: { params: { to: string }; context: Readonly<RouterContextProvider> },
      ) => {
        log.record(`plotting ${params.to}`);
        return log.entries();
      },
    );
    const { response } = await run(di.middleware, async (context) =>
      Response.json(await loader({ params: { to: 'Kepler-442b' }, context })),
    );
    expect(count(events, 'scope:dispose')).toBe(0);
    expect(await response.json()).toEqual(['survey-7: plotting Kepler-442b']);
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('keeps the scope open while a streamed response reads a scoped instance', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const { response } = await run(di.middleware, async (context) => {
      const log = await loader({ context });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(controller) {
            await new Promise((r) => setTimeout(r, 20));
            log.record('deferred');
            controller.enqueue(encoder.encode(log.entries().join(',')));
            controller.close();
          },
        }),
      );
    });
    expect(await response.text()).toBe('survey-7: deferred');
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('creates no scope when no loader resolves anything', async () => {
    const events: TraceEvent[] = [];
    const mapping = vi.fn(request);
    const di = nexus(await ship(events), { request: mapping });
    await run(di.middleware, async () => new Response('static'));
    await settle();
    expect(mapping).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('sets NEXUS_SCOPE and ends the request when the client left before the middleware ran', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const downstream = vi.fn(async (context: RouterContextProvider) => {
      expect(context.get(NEXUS_SCOPE).started).toBe(false);
      return new Response(null, { status: 204 });
    });
    await run(di.middleware, downstream, { signal: AbortSignal.abort() });
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('shares one scope between parallel loaders', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const a = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const b = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const { response } = await run(di.middleware, async (context) => {
      const [x, y] = await Promise.all([a({ context }), b({ context })]);
      return new Response(String(x === y));
    });
    expect(await response.text()).toBe('true');
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
  });

  it('throws a 500 Response with no core text for a request that misses its mapping', async () => {
    const di = nexus(await ship(), {
      request: () => undefined as unknown as NexusRequest,
      log: () => {},
    });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(500);
    expect(await (thrown as Response).text()).not.toContain('NEXUS_');
  });

  it('throws a 503 Response once the container is disposed', async () => {
    const built = await ship();
    const di = nexus(built, { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    await built[Symbol.asyncDispose]();
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(503);
  });

  it('serves the first request into a lazy route with di.load', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const navigation = di.load(Navigation);
    const loader = navigation.inject({ routes: NAV_ROUTES }, ({ routes }) =>
      routes.find('kepler'),
    );
    const { response } = await run(di.middleware, async (context) => {
      const result = await navigation(
        {
          request: new Request('http://bridge/nav'),
          context,
          params: {},
          unstable_pattern: '/nav',
        } as never,
        async () => new Response(await loader({ context })),
      );
      return result as Response;
    });
    expect(await response.text()).toBe('route to kepler');
    expect(count(events, 'scope:extend')).toBe(0);
  });

  it('reads a scope the test owns through existingScope and disposes nothing', async () => {
    const built = await ship();
    const di = nexus(built, { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => {
      log.record('from test');
      return log.entries();
    });
    await using scope = await built.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    const context = new RouterContextProvider(
      new Map([[NEXUS_SCOPE, existingScope(scope)]]),
    );
    expect(await loader({ context })).toEqual(['survey-7: from test']);
    expect(scope.get(FLIGHT_LOG).entries()).toEqual(['survey-7: from test']);
  });

  it('rejects di.scope when the middleware did not run', async () => {
    const di = nexus(await ship(), { request });
    await expect(di.scope(new RouterContextProvider())).rejects.toThrow(
      "[@nexusdi/react-router] no scope on this request: add di.middleware to the root route's middleware export",
    );
  });
});
```

`libs/react-router/src/nexus.test-d.ts`:

```ts
import { Nexus, Token, optional } from '@nexusdi/core';
import type { RouterContextProvider } from 'react-router';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus } from './index.js';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const RELAY = new Token<string>('Relay');
declare const ship: Nexus;
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

interface LoaderArgs {
  params: { to: string };
  request: Request;
  context: Readonly<RouterContextProvider>;
}

describe('@nexusdi/react-router types', () => {
  it('types the record and keeps the args type of the wrapped loader', () => {
    const loader = di.inject(
      { log: FLIGHT_LOG, relay: optional(RELAY) },
      (deps, args: LoaderArgs) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(deps.relay).toEqualTypeOf<string | undefined>();
        expectTypeOf(args.params.to).toEqualTypeOf<string>();
        return { course: args.params.to };
      },
    );
    expectTypeOf(loader).parameter(0).toEqualTypeOf<LoaderArgs>();
    expectTypeOf(loader).returns.resolves.toEqualTypeOf<{ course: string }>();
  });

  it('requires the request mapping when NexusRequest has a required field', () => {
    // @ts-expect-error: test-support makes `mission` required
    nexus(ship, {});
  });
});
```

- [ ] Step 4: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react-router`
Expected: FAIL, cannot find `./index.js`.

- [ ] Step 5: Implement `libs/react-router/src/nexus.ts`

```ts
import type {
  DepsMap,
  ModuleRef,
  NexusRequest,
  ResolvedDeps,
  Scope,
} from '@nexusdi/core';
import {
  createContext,
  type MiddlewareFunction,
  type Params,
  type RouterContextProvider,
} from 'react-router';

import { disposeWithBody } from './internal/dispose-with-body.js';
import {
  type ContainerSource,
  containerOf,
  defaultLog,
  loader,
  type LogPhase,
  type NexusLog,
  once,
  type RequestOption,
  type RequestScope,
  requestScope,
  type ScopeRunner,
  toHttpError,
  validateNow,
  validator,
} from './internal/request-scope.js';

const ADAPTER = '@nexusdi/react-router';

/** The request's scope handle, which di.middleware sets on the router context. */
export const NEXUS_SCOPE = createContext<RequestScope>();

// ScopeRunner and RequestOption come from the shared request-scope.ts (Task 1).
export type { ScopeRunner } from './internal/request-scope.js';

export interface RequestInput {
  readonly request: Request;
  readonly params: Params;
}

export type NexusRouterOptions = RequestOption<RequestInput> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

type WithContext = { readonly context: Readonly<RouterContextProvider> };

type Inject = <const D extends DepsMap, A extends WithContext, R>(
  deps: D,
  handler: (deps: ResolvedDeps<D>, args: A) => R,
) => (args: A) => Promise<Awaited<R>>;

export interface NexusRouter {
  readonly middleware: MiddlewareFunction<Response>;
  readonly inject: Inject;
  scope(context: Readonly<RouterContextProvider>): Promise<Scope>;
  load(
    module: ModuleRef,
  ): MiddlewareFunction<Response> & { readonly inject: Inject };
}

export function nexus(
  ship: ContainerSource,
  options: NexusRouterOptions,
): NexusRouter {
  const container = containerOf(ship);
  const log = options.log ?? defaultLog;
  const load = loader(container);

  /** React Router renders the nearest error boundary for a thrown Response (spec 7.4). */
  const fail = (error: unknown, phase: LogPhase): never => {
    const http = toHttpError(error, log, ADAPTER, phase);
    throw new Response(http.message, {
      status: http.status,
      statusText: http.message,
    });
  };

  const handleOf = (context: Readonly<RouterContextProvider>): RequestScope => {
    try {
      return context.get(NEXUS_SCOPE);
    } catch {
      throw new Error(
        `[${ADAPTER}] no scope on this request: add di.middleware to the root route's middleware export`,
      );
    }
  };

  const middleware: MiddlewareFunction<Response> = async (
    { request, context, params },
    next,
  ) => {
    const handle = requestScope(container, () =>
      options.request?.({ request, params }),
    );
    const dispose = once(() =>
      handle
        .close()
        .catch((error: unknown) =>
          log(error, { adapter: ADAPTER, phase: 'dispose' }),
        ),
    );
    context.set(NEXUS_SCOPE, handle); // set before any return, so loaders always find it
    if (request.signal.aborted) {
      await dispose(); // the client left: close the handle, so a late inject rejects
      return next();
    }
    request.signal.addEventListener('abort', () => void dispose(), {
      once: true,
    });
    let response: Response;
    if (options.scopes) {
      let scope: Scope;
      try {
        scope = await handle.scope();
      } catch (error) {
        await dispose();
        return fail(error, 'scope');
      }
      response = await options.scopes.run(scope, next);
    } else {
      response = await next(); // loaders create the scope on first use
    }
    return disposeWithBody(response, dispose, request.method);
  };

  const injectWith =
    (check: () => Promise<void>): Inject =>
    (deps, handler) =>
    async (args) => {
      try {
        await check();
      } catch (error) {
        return fail(error, 'validate');
      }
      let resolved: ResolvedDeps<typeof deps>;
      try {
        resolved = (await handleOf(args.context).scope()).resolve(deps);
      } catch (error) {
        return fail(error, 'scope');
      }
      return await handler(resolved, args);
    };

  return {
    middleware,
    inject(deps, handler) {
      validateNow(ship, deps, log, ADAPTER);
      return injectWith(validator(container, deps))(deps, handler);
    },
    async scope(context) {
      const handle = handleOf(context);
      try {
        return await handle.scope();
      } catch (error) {
        return fail(error, 'scope');
      }
    },
    load(module) {
      const section: MiddlewareFunction<Response> = async (
        { context },
        next,
      ) => {
        try {
          await load(module);
          const handle = handleOf(context);
          if (handle.started) await (await handle.scope()).extend();
        } catch (error) {
          return fail(error, 'load');
        }
        return next();
      };
      const sectionInject: Inject = (deps, handler) =>
        injectWith(validator(() => load(module), deps))(deps, handler);
      return Object.assign(section, { inject: sectionInject });
    },
  };
}
```

`libs/react-router/src/index.ts`:

```ts
export { NEXUS_SCOPE, nexus } from './nexus.js';
export type {
  NexusRouter,
  NexusRouterOptions,
  RequestInput,
  ScopeRunner,
} from './nexus.js';
export { existingScope } from './internal/request-scope.js';
export type {
  ContainerSource,
  LogContext,
  LogPhase,
  NexusLog,
  RequestScope,
} from './internal/request-scope.js';
```

`existingScope` returns `ClosableRequestScope`, which is assignable to the `RequestScope` that `NEXUS_SCOPE` holds.

- [ ] Step 6: Run the tests, type tests, lint and the repo checks

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/react-router @nexusdi/repo-checks`
Expected: PASS, including `adapter-shared-copies` (two copies of `dispose-with-body.ts`, four of `request-scope.ts`), `no-copies`, `owner-vocabulary` (`@nexusdi/react-router` uses its `NEXUS_DISPOSED` entry through the copied `request-scope.ts`), `edge-safe` and `core-layers`.

- [ ] Step 7: Commit

```bash
git add libs/react-router commitlint.config.js .fallowrc.jsonc tools/repo-checks/src/no-copies.test.ts tools/repo-checks/src/npm-readmes-data.ts package.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(react-router): scope each React Router request from middleware to loaders

The root middleware sets a lazy scope handle on the router context before
anything else, so loaders always find it, and disposes the scope when the
streamed body ends. inject wraps loaders, actions and middleware, and
di.load extends a scope that a lazy route's module needs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: React Router fixture app tests and README

Files:

- Create: `libs/react-router/test-fixtures/app/` (`react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `app/root.tsx`, `app/routes.ts`, `app/entry.server.tsx`, `app/nexus.server.ts`, `app/ship.ts`, `app/routes/course.tsx`, `app/routes/navigation.tsx`, `app/routes/fail.tsx`), `libs/react-router/test-support/fixture-server.ts`, `libs/react-router/src/react-router.e2e.test.ts`, `libs/react-router/README.md`, `libs/react-router/CHANGELOG.md`
- Modify: `libs/react-router/vite.config.ts` (`globalSetup`), `libs/react-router/tsconfig.spec.json` (`include` `test-support/**/*.ts`), `.fallowrc.jsonc` (`entry` for the fixture app's route modules and the global setup)

The fixture app lives in `libs/react-router/test-fixtures/`, outside `src/`. Spec 7.7 names `src/__fixtures__/app`; outside `src/`, the fixture can import `node:` modules in its config and stays out of `core-layers`, `owner-vocabulary` and the lib build, which scan or compile `src/`.

Interfaces:

- Consumes: `nexus`, `NEXUS_SCOPE` (Task 9); `trace` from `@nexusdi/devtools`; `nodeScopes` from `@nexusdi/node`.
- Produces: `setup(): void` and `startFixture(): Promise<{ url: string; events: TraceEvent[]; close(): Promise<void> }>` in `test-support/fixture-server.ts`, test-only. The helper imports `node:` modules, so it lives outside `src/`, where `nodeViolations` would refuse it.

- [ ] Step 1: Write the fixture app

`libs/react-router/test-fixtures/app/react-router.config.ts`:

```ts
import { createRequire } from 'node:module';

import type { Config } from '@react-router/dev/config';

// The adapter-peers job (spec 13.4) installs React Router 7.9.0 and latest 7.x
// over the workspace. On 7.x, middleware needs the v8_middleware flag; on 8.x
// it is always on and the flag is gone.
const { version } = createRequire(import.meta.url)(
  'react-router/package.json',
) as { version: string };
const seven = version.startsWith('7.');

export default {
  ssr: true,
  ...(seven ? { future: { v8_middleware: true } } : {}),
} satisfies Config;
```

`app/ship.ts`:

```ts
import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

export interface Mission {
  id: string;
  target: string;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export interface INavRoutes {
  find(sector: string): string;
}
export const MISSION = new Token<Mission>('Mission');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

export const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (r: NexusRequest) => r.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

export const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, { useValue: { find: (s: string) => `route to ${s}` } }),
  ],
  exports: [NAV_ROUTES],
});
```

`app/nexus.server.ts`:

```ts
import { Nexus, type TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nexus } from '@nexusdi/react-router';

import { Meridian } from './ship';

// The test reads the trace through this global key. The marker string is
// used by the log below, so it is in the server build; the client-bundle
// check asserts it never reaches build/client.
const FIXTURE_MARKER = 'nexus-server-fixture-marker';
const store = globalThis as { ['react-router-fixture.events']?: TraceEvent[] };
const events = (store['react-router-fixture.events'] ??= []);

const ship = await Nexus.create(Meridian, {
  plugins: [trace((event) => events.push(event))],
});

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
  log: (error, context) => {
    if (context.phase === 'dispose') console.error(FIXTURE_MARKER, error);
  },
});
```

`app/root.tsx`:

```tsx
import { Links, Meta, Outlet, Scripts } from 'react-router';

import { di } from './nexus.server';
import type { Route } from './+types/root';

export const middleware: Route.MiddlewareFunction[] = [di.middleware];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

`app/routes.ts`:

```ts
import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
  route('course/:to', './routes/course.tsx'),
  route('nav/:sector', './routes/navigation.tsx'),
  route('fail', './routes/fail.tsx'),
] satisfies RouteConfig;
```

`app/routes/course.tsx` (a deferred value that reads the scoped log after the loader returned):

```tsx
import { Suspense } from 'react';
import { Await, useLoaderData } from 'react-router';

import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';
import type { Route } from './+types/course';

export const loader = di.inject(
  { log: FLIGHT_LOG },
  ({ log }, { params }: Route.LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    const late = new Promise<string>((resolve) =>
      setTimeout(() => {
        log.record('course locked');
        resolve(log.entries().join(' | '));
      }, 50),
    );
    return { to: params.to, late };
  },
);

export default function Course() {
  const { to, late } = useLoaderData<typeof loader>();
  return (
    <main>
      <h1>{to}</h1>
      <Suspense fallback={<p>plotting</p>}>
        <Await resolve={late}>{(entries) => <p id="log">{entries}</p>}</Await>
      </Suspense>
    </main>
  );
}
```

`app/routes/navigation.tsx` (a section whose module is loaded by its own middleware):

```tsx
import { useLoaderData } from 'react-router';

import { di } from '../nexus.server';
import { NAV_ROUTES, Navigation } from '../ship';
import type { Route } from './+types/navigation';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: Route.LoaderArgs) => ({
    route: routes.find(params.sector),
  }),
);

export default function Nav() {
  return <p id="route">{useLoaderData<typeof loader>().route}</p>;
}
```

`app/routes/fail.tsx`:

```tsx
import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';

export const loader = di.inject({ log: FLIGHT_LOG }, () => {
  throw new Error('sector not charted');
});

export default function Fail() {
  return null;
}
```

`app/entry.server.tsx`: React Router's default Node entry (`npx react-router reveal entry.server` in the fixture, kept as generated), and `vite.config.ts`:

```ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [reactRouter()] });
```

`tsconfig.json` extends `../../../../tsconfig.base.json` with `"jsx": "react-jsx"`, `"rootDirs": [".", "./.react-router/types"]`, `"types": ["node", "vite/client"]`, and includes `app/**/*` and `.react-router/types/**/*`.

- [ ] Step 2: Write the test helper `libs/react-router/test-support/fixture-server.ts`

```ts
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { TraceEvent } from '@nexusdi/core';
import { createRequestListener } from '@react-router/node';

export const FIXTURE = join(import.meta.dirname, '..', 'test-fixtures', 'app');

/** Builds the fixture once per run; vite.config.ts names this as globalSetup. */
export function setup(): void {
  execFileSync('npx', ['react-router', 'build'], {
    cwd: FIXTURE,
    stdio: 'inherit',
  });
}

export async function startFixture() {
  const build = await import(
    pathToFileURL(join(FIXTURE, 'build', 'server', 'index.js')).href
  );
  const server = createServer(createRequestListener({ build }));
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const store = globalThis as {
    ['react-router-fixture.events']?: TraceEvent[];
  };
  const events = (store['react-router-fixture.events'] ??= []);
  events.length = 0;
  return {
    url: `http://127.0.0.1:${port}`,
    events,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}
```

In `libs/react-router/vite.config.ts` add `globalSetup: ['./test-support/fixture-server.ts']` to `test`, and add `"libs/react-router/test-support/fixture-server.ts"` to `.fallowrc.jsonc` `entry` (Vitest loads it by path).

- [ ] Step 3: Write the failing integration test `libs/react-router/src/react-router.e2e.test.ts`

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURE, startFixture } from '../test-support/fixture-server.js';

let fixture: Awaited<ReturnType<typeof startFixture>>;
beforeAll(async () => {
  fixture = await startFixture();
});
afterAll(async () => fixture.close());

const count = (type: string) =>
  fixture.events.filter((e) => e.type === type).length;
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe('@nexusdi/react-router in a built app', () => {
  it('keeps the scope open until the deferred value has streamed', async () => {
    const before = count('scope:dispose');
    const html = await (
      await fetch(`${fixture.url}/course/Kepler-442b`)
    ).text();
    expect(html).toContain(
      'survey-7: plotting Kepler-442b | survey-7: course locked',
    );
    expect(html).not.toContain('NEXUS_DISPOSED');
    await until(() => count('scope:dispose') === before + 1);
  });

  it('serves .data requests through the same middleware', async () => {
    const res = await fetch(`${fixture.url}/course/Vega.data`);
    expect(res.status).toBe(200);
  });

  it('serves the first request into the lazy route on a fresh server', async () => {
    const before = count('scope:extend');
    const html = await (await fetch(`${fixture.url}/nav/kepler`)).text();
    expect(html).toContain('route to kepler');
    expect(count('scope:extend')).toBe(before);
  });

  it('disposes the scope of an aborted document request', async () => {
    const before = count('scope:dispose');
    const controller = new AbortController();
    const res = await fetch(`${fixture.url}/course/Altair`, {
      signal: controller.signal,
    });
    await res.body!.getReader().read();
    controller.abort();
    await until(() => count('scope:dispose') === before + 1);
  });

  it('renders the error boundary with 500 when a loader throws, and disposes', async () => {
    const before = count('scope:dispose');
    const res = await fetch(`${fixture.url}/fail`);
    expect(res.status).toBe(500);
    await res.text();
    await until(() => count('scope:dispose') === before + 1);
  });

  it('gives 50 concurrent requests 50 scopes', async () => {
    const created = count('scope:create');
    const disposed = count('scope:dispose');
    const pages = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${fixture.url}/course/S${i}`, {
          headers: { 'x-mission-id': `survey-${i}` },
        }).then((r) => r.text()),
      ),
    );
    pages.forEach((html, i) =>
      expect(html).toContain(`survey-${i}: plotting S${i}`),
    );
    await until(() => count('scope:dispose') === disposed + 50);
    expect(count('scope:create')).toBe(created + 50);
  });

  it('keeps nexus.server.ts and core out of the client build', () => {
    const dir = join(FIXTURE, 'build', 'client', 'assets');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toContain('nexus-server-fixture-marker');
      expect(text, file).not.toContain('nexusdi.error');
    }
  });
});
```

`nexusdi.error` is the `Symbol.for` key every copy of core writes (`errors/nexus-error.ts`), so a client chunk with core in it contains the string.

- [ ] Step 4: Run it and see it fail, then pass

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react-router`
Expected first: FAIL until the fixture files of Step 1 exist and build. After Steps 1 and 2: PASS. A failing deferred test with `NEXUS_DISPOSED` in the HTML means the body wrapper was bypassed; check that `di.middleware` returns `disposeWithBody(...)`.

- [ ] Step 5: Write the README `libs/react-router/README.md`

The README follows the marketing shape of the express, fastify and hono READMEs: tagline "Scope every React Router request with NexusDI, from middleware to loaders.", a lead-in on the problem, one H2 on how the scope follows the request, Installation, Quick Example, Documentation and License, within the sub-package limit of 90 lines. The Quick Example is spec 7.2's Getting started (`nexus.server.ts`, the root `middleware` export, a loader with `di.inject`), as a doctest that builds a `RouterContextProvider` with `existingScope` and calls the loader directly, so it needs no server, with a `// -> ['survey-7: plotting Kepler-442b']` claim and no `await using`. Install line: `npm install @nexusdi/react-router@next @nexusdi/core@next react-router`. `CHANGELOG.md` as in Task 8. The sections Typed loaders (`inject`), Lazy routes (`di.load`), When the scope is disposed, Errors, Ambient scope, Testing loaders (`NEXUS_SCOPE` and `existingScope`) and Requirements (`react-router` `^7.9.0` with `future.v8_middleware: true`, or `^8.0.0`; Node 22.12, and 22.22 for React Router 8) belong to the `/react-router-ssr/` guide of Task 27.

- [ ] Step 6: Run everything for the package

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/react-router @nexusdi/repo-checks && npx fallow dead-code --fail-on-issues && npx fallow dupes`
Expected: PASS. If `fallow dead-code` reports the fixture's route modules, add `"libs/react-router/test-fixtures/app/app/**/*.{ts,tsx}"` to `.fallowrc.jsonc` `entry` with a comment that React Router loads route modules by file convention.

- [ ] Step 7: Commit

```bash
git add libs/react-router .fallowrc.jsonc
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(react-router): run the adapter in a built React Router app

A fixture app built with react-router build and served on port 0 checks
that a deferred value reads its scoped log before the scope ends, that a
lazy route's first request works, that aborts and loader errors dispose,
and that no server module reaches the client build.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `@nexusdi/react` package, `NexusProvider`, `useService` and the four errors

Alignment this task and Tasks 12 to 15 apply to the React spec (`specs/2026-09-24-react-design.md` on `origin/spec/react` at `26cb2a26`):

- R16's rc.0 target is rc.2 (owner answer Q2, 2026-10-15).
- Section 14 says the four `NEXUS_REACT_*` codes carry core's one-line message and no text. On `release/0.4`, `tools/repo-checks/src/error-text-placement.test.ts` requires every declared code to have a pack entry under `./text` or an inline raise site (`new X(fields, { text })`). A pack would never be shown, because `formatError` does not reach errors raised in render. So the four raise sites pass inline `text`, the form `@nexusdi/decorators` uses for `NEXUS_LEGACY_DECORATORS`. The extension principle's V11 (build that text only outside production) is an open owner question; if the owner approves it, a follow-up task wraps each `text` in the `dev` constant of Task 14. Until then the text ships in every build (about 300 B gzip).
- Each code needs a page under `apps/docs/content/errors/` (`doc-error-codes.test.ts`). This task adds one entry per code to `tools/repo-checks/src/doc-error-codes-allowance.json`; Task 27 writes the pages and removes the entries.
- The spec's examples use `STAR_CATALOG`, `COURSE_PLOTTER` and `Cartography`, which docs spec §7.1 does not list. Tests here use `NAV_CHARTS`, `FLIGHT_LOG`, `MISSION`, `DIAGNOSTICS` and a `Navigation` section module.
- The store is one object per container (`storeFor(container)`), so two providers over one container share the section cache and the scope set. Spec section 3.1 says "once per container", and section 7.1 keys the cache by container; section 6.5's "every live scope of its provider" becomes every live scope of the container, which is a superset and costs one `extend()` call that returns at once.

Files:

- Create: `libs/react/` (generator), `libs/react/src/index.ts`, `libs/react/src/errors.ts`, `libs/react/src/context.ts`, `libs/react/src/store.ts`, `libs/react/src/release.ts`, `libs/react/src/report.ts`, `libs/react/src/hydrated.ts`, `libs/react/src/provider.tsx`, `libs/react/src/use-service.ts`, `libs/react/README.md`, `libs/react/docs/examples.md`
- Test: `libs/react/src/provider.test.tsx`, `libs/react/src/use-service.test.tsx`, `libs/react/src/errors.test.ts`, `libs/react/src/use-service.test-d.tsx`, `libs/react/src/support/boundary.tsx`
- Modify: `libs/react/package.json`, `libs/react/project.json`, `libs/react/tsconfig.lib.json`, `libs/react/tsconfig.spec.json`, `libs/react/vite.config.ts`, `libs/react/eslint.config.mjs`, `commitlint.config.js` (scope `react`), `.fallowrc.jsonc` (`publicPackages`), `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES`, `SPECS`), `tools/repo-checks/src/doc-error-codes-allowance.json`

Interfaces:

- Consumes: `Nexus`, `Scope`, `MultiToken`, `InjectionToken`, `LookupOptions`, `errorBase` from `@nexusdi/core` 0.4.0-rc.1.
- Produces:
  - `NexusProvider(props: NexusProviderProps): ReactElement`, with `NexusProviderProps = { container: Nexus | Promise<Nexus> | null; scope?: Scope; dispose?: boolean; clientOnly?: boolean; fallback?: ReactNode; children?: ReactNode }`.
  - `useService<T>(token: MultiToken<T>, options?: LookupOptions): readonly T[]`, `useService<T>(token: InjectionToken<T>, options?: LookupOptions): T`, `useContainer(): Nexus`.
  - `NoProviderError` (`NEXUS_REACT_NO_PROVIDER`, fields `{ hook: string }`), `TransientInRenderError` (`NEXUS_REACT_TRANSIENT_IN_RENDER`, `{ token: string; provider: string }`), `NestedScopeError` (`NEXUS_REACT_NESTED_SCOPE`, no fields), `SectionConflictError` (`NEXUS_REACT_SECTION_CONFLICT`, `{ section: string }`), and the raise helpers `noProvider(hook)`, `transientInRender(token, provider)`, `nestedScope()`, `sectionConflict(section)`, all package-internal except the classes.
  - Internal, for Tasks 12 to 15: `NexusContext`, `NexusContextValue = { container: Nexus; resolver: Nexus | Scope; store: Store; scoped: boolean }`, `useNexusContext(hook: string): NexusContextValue`, `class Store` with `memo(resolver, token, module, next)`, `storeFor(container: Nexus): Store`, `deferred(dispose: () => Promise<void>): Lease` with `Lease = { acquire(): void; release(): void }`, `report(error: unknown): void`, `useHydrated(): boolean`.

- [ ] **Step 1: Scaffold**

```bash
cd <worktree>
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/react --name=@nexusdi/react --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
```

If `nx.json` lost a comment, run `git checkout nx.json` and re-apply only the generator's functional additions. Delete `libs/react/src/lib/`. Copy `libs/node/project.json`, `libs/node/tsconfig.json` and `libs/node/eslint.config.mjs` over the generated files, then replace `@nexusdi/node` with `@nexusdi/react` and `libs/node` with `libs/react` in them. In `eslint.config.mjs`, widen the test override's `files` to `['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts', '**/*.test-d.tsx']`.

`libs/react/package.json`:

```json
{
  "name": "@nexusdi/react",
  "version": "0.4.0-rc.1",
  "description": "Give React components the services of a NexusDI container, with subtree scopes and lazily loaded sections.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "react",
    "hooks",
    "typescript"
  ],
  "homepage": "https://github.com/NexusDI/core#readme",
  "bugs": { "url": "https://github.com/NexusDI/core/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/react"
  },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22.12" },
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "@nexusdi/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/**/*.tsbuildinfo",
    "src",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/*.test-d.*",
    "!src/**/__fixtures__/**",
    "!src/support/**",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "peerDependencies": {
    "@nexusdi/core": "0.4.0-rc.1",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@nexusdi/devtools": "0.4.0-rc.1",
    "@nexusdi/testing": "0.4.0-rc.1",
    "@testing-library/react": "16.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "jsdom": "^30.0.1",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "publishConfig": { "access": "public", "provenance": true }
}
```

`react-dom` is a dev dependency only, at the same spec as `react` (`react-pair.test.ts`). It is no peer: the package uses no DOM API (react spec 16). Copy `libs/node/LICENSE` and create an empty `CHANGELOG.md` with the heading `# Changelog`.

`libs/react/tsconfig.lib.json`: copy `libs/node/tsconfig.lib.json`, then set `"jsx": "react-jsx"`, `"types": []`, `"lib": ["es2022", "dom", "esnext.disposable"]`, `"include": ["src/**/*.ts", "src/**/*.tsx"]`, and extend `exclude` with `"src/**/*.test.tsx"`, `"src/**/*.test-d.tsx"`, `"src/support/**"`, `"src/**/__fixtures__/**"`.

`libs/react/tsconfig.spec.json`: copy `libs/node/tsconfig.spec.json`, then add `"jsx": "react-jsx"`, add `"dom"` to `lib`, and extend `include` with `"src/**/*.test.tsx"`, `"src/**/*.test-d.tsx"`, `"src/support/**/*.tsx"`.

`libs/react/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { docExampleSources, docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/react',
  tsconfig: './tsconfig.spec.json',
  plugins: [react()],
  ...docExamples(),
  build: { sourcemap: false },
  test: {
    name: '@nexusdi/react',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/**/__fixtures__/**', 'src/**/*.e2e.test.ts'],
    includeSource: docExampleSources(),
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.spec.json',
      include: ['src/**/*.test-d.{ts,tsx}'],
    },
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      exclude: [
        '**/index.ts',
        'dist/**/*',
        'vite.config.ts',
        'eslint.config.mjs',
      ],
    },
  },
}));
```

Add `'react'` to `commitlint.config.js` `scope-enum` after `'cli'`, `"@nexusdi/react"` to `.fallowrc.jsonc` `publicPackages`, `'react'` to `PACKAGES` in `tools/repo-checks/src/npm-readmes-data.ts` and `react: { kind: 'sub-package', dev: false }` to `SPECS`. Run `npm install` from the worktree root.

- [ ] **Step 2: Write the failing tests**

`libs/react/src/support/boundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react';

/** A plain error boundary for tests: renders the caught error's message. */
export class Boundary extends Component<
  { children?: ReactNode },
  { error: unknown }
> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error !== null)
      return <p role="alert">{(this.state.error as Error).message}</p>;
    return this.props.children;
  }
}
```

`libs/react/src/errors.test.ts`:

```ts
import { isNexusError } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import {
  nestedScope,
  noProvider,
  sectionConflict,
  transientInRender,
} from './errors.js';

describe('the package errors', () => {
  it('raises each code with its fields and a docs link', () => {
    const cases = [
      [noProvider('useService'), 'NEXUS_REACT_NO_PROVIDER'],
      [
        transientInRender('DroneFactory', 'ScoutDrone'),
        'NEXUS_REACT_TRANSIENT_IN_RENDER',
      ],
      [nestedScope(), 'NEXUS_REACT_NESTED_SCOPE'],
      [sectionConflict('navigation'), 'NEXUS_REACT_SECTION_CONFLICT'],
    ] as const;
    for (const [error, code] of cases) {
      expect(isNexusError(error, code)).toBe(true);
      expect(error.message).toContain(`[${code}]`);
      expect(error.message).toContain('Fix:');
    }
  });

  it('keeps the fields as own enumerable properties', () => {
    expect({ ...transientInRender('DroneFactory', 'ScoutDrone') }).toEqual({
      token: 'DroneFactory',
      provider: 'ScoutDrone',
    });
    expect({ ...noProvider('useContainer') }).toEqual({ hook: 'useContainer' });
    expect({ ...sectionConflict('navigation') }).toEqual({
      section: 'navigation',
    });
  });
});
```

`libs/react/src/provider.test.tsx`:

```tsx
import { isNexusError, Nexus, provide, Token } from '@nexusdi/core';
import { act, render, screen } from '@testing-library/react';
import { StrictMode, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NexusProvider, useContainer, useService } from './index.js';
import { Boundary } from './support/boundary.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

function Heading() {
  const charts = useService(NAV_CHARTS);
  return <p>{charts.plot('Kepler-442b').heading}</p>;
}

/** Waits past the deferred release's setTimeout(0). */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const disposed = (ship: Nexus) => {
  try {
    ship.get(NAV_CHARTS);
    return false;
  } catch (error) {
    return isNexusError(error, 'NEXUS_DISPOSED');
  }
};

afterEach(() => vi.restoreAllMocks());

describe('NexusProvider', () => {
  it('publishes a container to useService', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    expect(screen.getByText('42')).toBeTruthy();
    view.unmount();
  });

  it('suspends on a container promise until create settles', async () => {
    const ready = Nexus.create([provide(NAV_CHARTS, { useValue: fakeCharts })]);
    const view = render(
      <Suspense fallback={<p>Powering up</p>}>
        <NexusProvider container={ready}>
          <Heading />
        </NexusProvider>
      </Suspense>,
    );
    expect(screen.getByText('Powering up')).toBeTruthy();
    expect(await screen.findByText('42')).toBeTruthy();
    view.unmount();
    await (await ready)[Symbol.asyncDispose]();
  });

  it('throws a rejected create to the nearest error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ready = Nexus.create([
      provide(NAV_CHARTS, {
        useFactory: async (): Promise<INavCharts> => {
          throw new Error('charts offline');
        },
      }),
    ]);
    ready.catch(() => undefined);
    const view = render(
      <Boundary>
        <Suspense fallback={<p>Powering up</p>}>
          <NexusProvider container={ready}>
            <Heading />
          </NexusProvider>
        </Suspense>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_PROVIDER_FAILED',
    );
    view.unmount();
  });

  it('renders fallback for a null container', () => {
    const view = render(
      <NexusProvider container={null} fallback={<p>Docking</p>}>
        <Heading />
      </NexusProvider>,
    );
    expect(screen.getByText('Docking')).toBeTruthy();
    view.unmount();
  });

  it('never disposes a container without dispose', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <NexusProvider container={ship}>
        <Heading />
      </NexusProvider>,
    );
    view.unmount();
    await tick();
    expect(disposed(ship)).toBe(false);
  });

  it('keeps the container through StrictMode with dispose, and disposes it on unmount', async () => {
    const ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship} dispose>
          <Heading />
        </NexusProvider>
      </StrictMode>,
    );
    await tick();
    expect(disposed(ship)).toBe(false);
    view.unmount();
    await tick();
    expect(disposed(ship)).toBe(true);
  });

  it('swaps containers and disposes the dropped one with dispose', async () => {
    const first = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    await using second = await Nexus.create([
      provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 7 }) } }),
    ]);
    const view = render(
      <NexusProvider container={first} dispose>
        <Heading />
      </NexusProvider>,
    );
    await act(async () => {
      view.rerender(
        <NexusProvider container={second} dispose={false}>
          <Heading />
        </NexusProvider>,
      );
    });
    expect(screen.getByText('7')).toBeTruthy();
    await tick();
    expect(disposed(first)).toBe(true);
    expect(disposed(second)).toBe(false);
    view.unmount();
  });

  it('gives useContainer the root container', async () => {
    await using ship = await Nexus.create([
      provide(NAV_CHARTS, { useValue: fakeCharts }),
    ]);
    let seen: Nexus | undefined;
    function Probe() {
      seen = useContainer();
      return null;
    }
    const view = render(
      <NexusProvider container={ship}>
        <Probe />
      </NexusProvider>,
    );
    expect(seen).toBe(ship);
    view.unmount();
  });
});
```

`libs/react/src/use-service.test.tsx`:

```tsx
import {
  defineModule,
  isNexusError,
  MultiToken,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { render, renderHook, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NexusProvider,
  NoProviderError,
  useContainer,
  useService,
} from './index.js';
import { Boundary } from './support/boundary.js';

interface Diagnostic {
  readonly system: string;
}
const DIAGNOSTICS = new MultiToken<Diagnostic>('Diagnostics');
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const reactor: Diagnostic = { system: 'reactor' };
const hull: Diagnostic = { system: 'hull' };

afterEach(() => vi.restoreAllMocks());

describe('useService', () => {
  it('throws NEXUS_REACT_NO_PROVIDER outside a provider, naming the hook', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useService(FLIGHT_LOG))).toThrow(
      NoProviderError,
    );
    expect(() => renderHook(() => useContainer())).toThrow(/hook=useContainer/);
  });

  it('lets a get() error reach the error boundary unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    function Log() {
      useService(FLIGHT_LOG);
      return null;
    }
    const view = render(
      <Boundary>
        <NexusProvider container={ship}>
          <Log />
        </NexusProvider>
      </Boundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'NEXUS_MISSING_PROVIDER',
    );
    view.unmount();
  });

  it('throws NEXUS_SCOPE_REQUIRED for a scoped token under the root', async () => {
    await using ship = await Nexus.create([
      provide(FLIGHT_LOG, {
        useFactory: () => ({ record: () => undefined, entries: () => [] }),
        lifetime: 'scoped',
      }),
    ]);
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <NexusProvider container={ship}>{children}</NexusProvider>
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let caught: unknown;
    try {
      renderHook(() => useService(FLIGHT_LOG), { wrapper });
    } catch (error) {
      caught = error;
    }
    expect(isNexusError(caught, 'NEXUS_SCOPE_REQUIRED')).toBe(true);
  });

  it('returns the same MultiToken array while its contents match', async () => {
    await using ship = await Nexus.create([
      provide(DIAGNOSTICS, { useValue: reactor }),
    ]);
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <StrictMode>
        <NexusProvider container={ship}>{children}</NexusProvider>
      </StrictMode>
    );
    const { result, rerender, unmount } = renderHook(
      () => useService(DIAGNOSTICS),
      {
        wrapper,
      },
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual([reactor]);
    unmount();
  });

  it('returns a new array after a load() adds a contribution', async () => {
    await using ship = await Nexus.create([
      provide(DIAGNOSTICS, { useValue: reactor }),
    ]);
    const Hull = defineModule({
      name: 'Hull',
      providers: [provide(DIAGNOSTICS, { useValue: hull })],
      exports: [DIAGNOSTICS],
    });
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <NexusProvider container={ship}>{children}</NexusProvider>
    );
    const { result, rerender, unmount } = renderHook(
      () => useService(DIAGNOSTICS),
      {
        wrapper,
      },
    );
    const before = result.current;
    await ship.load(Hull);
    rerender();
    expect(result.current).not.toBe(before);
    expect(result.current.map((d) => d.system)).toEqual(['reactor', 'hull']);
    unmount();
  });
});
```

`libs/react/src/use-service.test-d.tsx`:

```tsx
import { MultiToken, Token } from '@nexusdi/core';
import { expectTypeOf, it } from 'vitest';

import { useService } from './index.js';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const DIAGNOSTICS = new MultiToken<{ system: string }>('Diagnostics');
class StatusBoard {
  readonly lines: string[] = [];
}

it('types a Token, a MultiToken and a class', () => {
  expectTypeOf(useService(FLIGHT_LOG)).toEqualTypeOf<IFlightLog>();
  expectTypeOf(useService(DIAGNOSTICS)).toEqualTypeOf<
    readonly { system: string }[]
  >();
  expectTypeOf(useService(StatusBoard)).toEqualTypeOf<StatusBoard>();
});

it('takes LookupOptions', () => {
  // @ts-expect-error -- module must be a ModuleRef
  useService(FLIGHT_LOG, { module: 42 });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react`
Expected: FAIL, cannot resolve `./errors.js` and `./index.js`.

- [ ] **Step 4: Implement**

`libs/react/src/errors.ts`:

```ts
import { errorBase } from '@nexusdi/core';

/** A hook or component of the package ran outside a NexusProvider. */
export class NoProviderError extends errorBase<
  'NEXUS_REACT_NO_PROVIDER',
  { readonly hook: string }
>('NEXUS_REACT_NO_PROVIDER', 'NoProviderError') {}

/** useService resolved a transient provider in render, with react() registered. */
export class TransientInRenderError extends errorBase<
  'NEXUS_REACT_TRANSIENT_IN_RENDER',
  { readonly token: string; readonly provider: string }
>('NEXUS_REACT_TRANSIENT_IN_RENDER', 'TransientInRenderError') {}

/** A ScopeProvider rendered under a scope after hydration. */
export class NestedScopeError extends errorBase<
  'NEXUS_REACT_NESTED_SCOPE',
  Record<never, never>
>('NEXUS_REACT_NESTED_SCOPE', 'NestedScopeError') {}

/** Two section modules claim one section name, or two copies of one section are in the page. */
export class SectionConflictError extends errorBase<
  'NEXUS_REACT_SECTION_CONFLICT',
  { readonly section: string }
>('NEXUS_REACT_SECTION_CONFLICT', 'SectionConflictError') {}

export function noProvider(hook: string): NoProviderError {
  return new NoProviderError(
    { hook },
    {
      text:
        `${hook} ran outside a NexusProvider, so it has no container to read.\n` +
        '  Fix: render the component under <NexusProvider>, or give the test a wrapper that renders one.',
    },
  );
}

export function transientInRender(
  token: string,
  provider: string,
): TransientInRenderError {
  return new TransientInRenderError(
    { token, provider },
    {
      text:
        `useService(${token}) resolved the transient provider ${provider} in render, which builds a new instance on every render.\n` +
        '  Fix: resolve it in an event handler or an effect through useContainer(), make it scoped and read it under a ScopeProvider, or bind a factory function the component calls.',
    },
  );
}

export function nestedScope(): NestedScopeError {
  return new NestedScopeError(
    {},
    {
      text:
        'A ScopeProvider rendered under another scope, and scopes do not nest in NexusDI 0.4.\n' +
        '  Fix: move the inner ScopeProvider beside the outer one, or let the subtree share the outer scope.',
    },
  );
}

export function sectionConflict(section: string): SectionConflictError {
  return new SectionConflictError(
    { section },
    {
      text:
        `Two section modules are loaded under the section name '${section}'.\n` +
        '  Fix: give each lazySection its own name, or remove the second copy of the section from the page.',
    },
  );
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_REACT_NO_PROVIDER: NoProviderError;
    NEXUS_REACT_TRANSIENT_IN_RENDER: TransientInRenderError;
    NEXUS_REACT_NESTED_SCOPE: NestedScopeError;
    NEXUS_REACT_SECTION_CONFLICT: SectionConflictError;
  }
}
```

`libs/react/src/report.ts`:

```ts
/** Hands an error nobody awaits to the browser's reportError, or to console.error where it is missing. */
export function report(error: unknown): void {
  const global = globalThis as { reportError?: (error: unknown) => void };
  if (typeof global.reportError === 'function') global.reportError(error);
  else console.error(error);
}
```

`libs/react/src/release.ts`:

```ts
import { report } from './report.js';

export interface Lease {
  acquire(): void;
  release(): void;
}

/**
 * A disposal that waits one task (react spec 6.3). StrictMode unmounts and
 * remounts effects synchronously, so its acquire cancels the timer the
 * release set, and the resource keeps its identity. A real unmount lets the
 * timer fire.
 */
export function deferred(dispose: () => Promise<void>): Lease {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    acquire() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    },
    release() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        dispose().catch(report);
      }, 0);
    },
  };
}
```

`libs/react/src/hydrated.ts`:

```ts
import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, true after it, and true at once
 * in a client-only render. The server snapshot keeps the hydration render
 * equal to the server HTML (react spec 6.1).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
```

`libs/react/src/store.ts`:

```ts
import type { Nexus, Scope } from '@nexusdi/core';

type Memo = Map<unknown, Map<unknown, readonly unknown[]>>;

/**
 * What the components of one container share: the MultiToken memo (react
 * spec 4.3). Tasks 13 and 14 add the scope set and the section cache.
 */
export class Store {
  readonly #memos = new WeakMap<Nexus | Scope, Memo>();

  constructor(readonly container: Nexus) {}

  /** The stored array while `next` holds the same elements by ===, else `next`, frozen and stored. */
  memo(
    resolver: Nexus | Scope,
    token: unknown,
    module: unknown,
    next: readonly unknown[],
  ): readonly unknown[] {
    let byToken = this.#memos.get(resolver);
    if (byToken === undefined) {
      byToken = new Map();
      this.#memos.set(resolver, byToken);
    }
    let byModule = byToken.get(token);
    if (byModule === undefined) {
      byModule = new Map();
      byToken.set(token, byModule);
    }
    const stored = byModule.get(module);
    if (
      stored !== undefined &&
      stored.length === next.length &&
      stored.every((item, i) => item === next[i])
    )
      return stored;
    const frozen = Object.freeze([...next]);
    byModule.set(module, frozen);
    return frozen;
  }
}

const stores = new WeakMap<Nexus, Store>();

/** The one store of `container`. */
export function storeFor(container: Nexus): Store {
  let store = stores.get(container);
  if (store === undefined) {
    store = new Store(container);
    stores.set(container, store);
  }
  return store;
}
```

`libs/react/src/context.ts`:

```ts
import type { Nexus, Scope } from '@nexusdi/core';
import { createContext, useContext } from 'react';

import { noProvider } from './errors.js';
import type { Store } from './store.js';

export interface NexusContextValue {
  readonly container: Nexus;
  /** The scope from a ScopeProvider or the SSR `scope` prop, else the container. */
  readonly resolver: Nexus | Scope;
  readonly store: Store;
  /** True when `resolver` is a scope. */
  readonly scoped: boolean;
}

export const NexusContext = createContext<NexusContextValue | null>(null);

export function useNexusContext(hook: string): NexusContextValue {
  const value = useContext(NexusContext);
  if (value === null) throw noProvider(hook);
  return value;
}
```

`libs/react/src/provider.tsx`:

```tsx
import type { Nexus, Scope } from '@nexusdi/core';
import {
  use,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from 'react';

import { NexusContext, type NexusContextValue } from './context.js';
import { useHydrated } from './hydrated.js';
import { deferred, type Lease } from './release.js';
import { storeFor } from './store.js';

export interface NexusProviderProps {
  container: Nexus | Promise<Nexus> | null;
  /** The request scope during SSR (react spec 9.1). */
  scope?: Scope;
  /** Dispose each container this provider stops rendering. Default false. */
  dispose?: boolean;
  /** Render fallback on the server and during hydration (react spec 9.2). */
  clientOnly?: boolean;
  fallback?: ReactNode;
  children?: ReactNode;
}

const leases = new WeakMap<Nexus, Lease>();

function leaseFor(container: Nexus): Lease {
  let lease = leases.get(container);
  if (lease === undefined) {
    lease = deferred(() => container[Symbol.asyncDispose]());
    leases.set(container, lease);
  }
  return lease;
}

function isPromise(value: Nexus | Promise<Nexus>): value is Promise<Nexus> {
  return typeof (value as { then?: unknown }).then === 'function';
}

export function NexusProvider({
  container,
  scope,
  dispose = false,
  clientOnly = false,
  fallback = null,
  children,
}: NexusProviderProps): ReactElement {
  const hydrated = useHydrated();
  const waiting = container === null || (clientOnly && !hydrated);
  // use() may run conditionally; it suspends to the nearest Suspense.
  const ship = waiting
    ? null
    : isPromise(container)
      ? use(container)
      : container;

  const value = useMemo<NexusContextValue | null>(
    () =>
      ship === null
        ? null
        : {
            container: ship,
            resolver: scope ?? ship,
            store: storeFor(ship),
            scoped: scope !== undefined,
          },
    [ship, scope],
  );

  useEffect(() => {
    if (!dispose || ship === null) return;
    const lease = leaseFor(ship);
    lease.acquire();
    return () => lease.release();
  }, [dispose, ship]);

  if (value === null) return <>{fallback}</>;
  return <NexusContext value={value}>{children}</NexusContext>;
}
```

`libs/react/src/use-service.ts`:

```ts
import {
  MultiToken,
  type InjectionToken,
  type LookupOptions,
  type Nexus,
} from '@nexusdi/core';

import { useNexusContext } from './context.js';

export function useService<T>(
  token: MultiToken<T>,
  options?: LookupOptions,
): readonly T[];
export function useService<T>(
  token: InjectionToken<T>,
  options?: LookupOptions,
): T;
export function useService(
  token: InjectionToken<unknown> | MultiToken<unknown>,
  options?: LookupOptions,
): unknown {
  const { resolver, store } = useNexusContext('useService');
  if (token instanceof MultiToken)
    return store.memo(
      resolver,
      token,
      options?.module,
      resolver.get(token, options),
    );
  return resolver.get(token, options);
}

/** The root container, also under a ScopeProvider, for load() and createScope() in effects. */
export function useContainer(): Nexus {
  return useNexusContext('useContainer').container;
}
```

`libs/react/src/index.ts`:

```ts
'use client';
export {
  NestedScopeError,
  NoProviderError,
  SectionConflictError,
  TransientInRenderError,
} from './errors.js';
export { NexusProvider, type NexusProviderProps } from './provider.js';
export { useContainer, useService } from './use-service.js';
```

`tools/repo-checks/src/doc-error-codes-allowance.json`:

```json
{
  "NEXUS_REACT_NESTED_SCOPE": "The error page lands with the React docs (integrations plan Task 27).",
  "NEXUS_REACT_NO_PROVIDER": "The error page lands with the React docs (integrations plan Task 27).",
  "NEXUS_REACT_SECTION_CONFLICT": "The error page lands with the React docs (integrations plan Task 27).",
  "NEXUS_REACT_TRANSIENT_IN_RENDER": "The error page lands with the React docs (integrations plan Task 27)."
}
```

`libs/react/README.md` (Task 15 adds the SSR and section paragraphs; `npm-readmes.test.ts` checks it now):

````md
# @nexusdi/react

[![npm](https://img.shields.io/npm/v/@nexusdi/react/next)](https://www.npmjs.com/package/@nexusdi/react)
[![license](https://img.shields.io/npm/l/@nexusdi/react)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give React components the services of a NexusDI container.**

A React app that uses a container writes the same glue in every team: a context and a hook around `get()`, a scope per dialog, a fallback while a lazy section loads. `@nexusdi/react` is that glue, over a container your app creates.

## How It Works

`NexusProvider` publishes a container, or the promise `Nexus.create` returns, and `useService(TOKEN)` reads a service with core's synchronous `get()`. `ScopeProvider` gives a subtree its own scope, and `SectionBoundary` loads a lazily imported module with a fallback. The optional `react()` plugin rejects a transient token read in render, in development and tests.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/react@next @nexusdi/core@next
```

## Quick Example

The app creates the container, and `NexusProvider` publishes it to every component below.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

await using ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog }),
]);
ship.get(FLIGHT_LOG).entries(); // -> []
typeof NexusProvider; // -> 'function'
```

In a component, `const log = useService(FLIGHT_LOG)` under `<NexusProvider container={ship}>` returns the same `IFlightLog`.

## Documentation

- [React](https://nexus.js.org/next/react/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/react/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
````

`libs/react/docs/examples.md`:

````md
# React examples

## A provider and a hook

`useService` reads a token from the container the provider publishes.

<!-- #region provider -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

await using ship = await Nexus.create([
  provide(NAV_CHARTS, { useValue: { plot: (to) => ({ to, heading: 42 }) } }),
]);
ship.get(NAV_CHARTS).plot('Kepler-442b').heading; // -> 42
```

<!-- #endregion provider -->
````

- [ ] **Step 5: Run the tests, the type tests and the repo checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/react && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS. `error-text-placement` finds an inline `text` for each of the four codes, `doc-error-codes` finds an allowance entry for each, `npm-readmes` accepts the README, `react-pair` sees `react` and `react-dom` at 19.3.0, and `nodeViolations` finds no `process` (the package has none until Task 14).

- [ ] **Step 6: Commit**

```bash
git add libs/react commitlint.config.js .fallowrc.jsonc package-lock.json tools/repo-checks/src/npm-readmes-data.ts tools/repo-checks/src/doc-error-codes-allowance.json nx.json tsconfig.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(react): add NexusProvider, useService and the package errors

NexusProvider publishes a container or the promise Nexus.create returns,
and suspends on the promise. useService reads a token with core's sync
get(), and keeps a MultiToken array stable while its contents match. With
dispose, the provider disposes a dropped container after one task, so
StrictMode's remount keeps it. The four NEXUS_REACT_* codes raise with
inline text, as @nexusdi/decorators does.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: the `react()` plugin and the transient check

Files:

- Create: `libs/react/src/plugin.ts`
- Modify: `libs/react/src/use-service.ts`, `libs/react/src/index.ts`
- Test: `libs/react/src/plugin.test.tsx`

Interfaces:

- Consumes: `NexusPlugin`, `PluginContext`, `BlueprintView`, `ProviderView`, `NEXUS_PLUGIN_API`, `displayName`, `moduleDefinitionOf` from `@nexusdi/core`; `transientInRender` from Task 11.
- Produces: `react(): NexusPlugin` (`{ name: 'nexusdi-react', apiVersion: NEXUS_PLUGIN_API, setup }`); internal `checkTransient(container: Nexus, token: unknown, options?: LookupOptions): void`, a no-op for a container without `react()`.

The plugin stores a reader of `context.blueprint()` per container, never the context itself. `error-text-placement.test.ts` fails a `setup` that passes its context on as a value (into a `WeakMap.set`, for example), because it can no longer follow the context's `format` calls. A closure that only calls `context.blueprint()` keeps the context in a binding the check can trace.

- [ ] **Step 1: Write the failing test** `libs/react/src/plugin.test.tsx`

```tsx
import {
  defineModule,
  isNexusError,
  MultiToken,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NexusProvider,
  react,
  TransientInRenderError,
  useService,
} from './index.js';

interface ISurveyDrone {
  launch(): string;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
const DRONE_ALIAS = new Token<ISurveyDrone>('SurveyDroneAlias');
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<{ system: string }>('Diagnostics');

let built = 0;
class ScoutDrone implements ISurveyDrone {
  constructor() {
    built += 1;
  }
  launch() {
    return 'scout';
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

const hook = (ship: Nexus, read: () => unknown) =>
  renderHook(read, {
    wrapper: ({ children }: { children?: ReactNode }) => (
      <NexusProvider container={ship}>{children}</NexusProvider>
    ),
  });

const thrown = (read: () => unknown): unknown => {
  try {
    read();
  } catch (error) {
    return error;
  }
  return undefined;
};

afterEach(() => {
  built = 0;
  vi.restoreAllMocks();
});

describe('react()', () => {
  it('rejects a transient token in render and builds nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
      { plugins: [react()] },
    );
    const error = thrown(() => hook(ship, () => useService(DRONE)));
    expect(error).toBeInstanceOf(TransientInRenderError);
    expect({ ...(error as object) }).toEqual({
      token: 'SurveyDrone',
      provider: 'ScoutDrone',
    });
    expect(built).toBe(0);
  });

  it('follows an alias to a transient target', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [
        provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
        provide(DRONE_ALIAS, { useExisting: DRONE }),
      ],
      { plugins: [react()] },
    );
    expect(
      thrown(() => hook(ship, () => useService(DRONE_ALIAS))),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('rejects a MultiToken with one transient contribution', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [
        provide(DIAGNOSTICS, { useValue: { system: 'reactor' } }),
        provide(DIAGNOSTICS, {
          useFactory: () => ({ system: 'hull' }),
          lifetime: 'transient',
        }),
      ],
      { plugins: [react()] },
    );
    expect(
      thrown(() => hook(ship, () => useService(DIAGNOSTICS))),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('lets singletons through', async () => {
    await using ship = await Nexus.create(
      [provide(NAV_CHARTS, { useValue: fakeCharts })],
      {
        plugins: [react()],
      },
    );
    const { result, unmount } = hook(ship, () => useService(NAV_CHARTS));
    expect((result.current as INavCharts).plot('Kepler-442b').heading).toBe(42);
    unmount();
  });

  it('leaves an unbound token to get(), which throws its own error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([], { plugins: [react()] });
    const error = thrown(() => hook(ship, () => useService(NAV_CHARTS)));
    expect(isNexusError(error, 'NEXUS_MISSING_PROVIDER')).toBe(true);
  });

  it('checks nothing without react()', async () => {
    await using ship = await Nexus.create([
      provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
    ]);
    const { unmount } = hook(ship, () => useService(DRONE));
    expect(built).toBeGreaterThan(0);
    unmount();
  });

  it('checks the module that replaced { module } under overrideModule', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
    });
    const NavigationStub = defineModule({
      name: 'NavigationStub',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: () => fakeCharts,
          lifetime: 'transient',
        }),
      ],
    });
    const Meridian = defineModule({ name: 'Meridian', imports: [Navigation] });
    await using ship = await createTestingContainer(Meridian)
      .overrideModule(Navigation, NavigationStub)
      .create({ plugins: [react()] });
    expect(
      thrown(() =>
        hook(ship, () => useService(NAV_CHARTS, { module: Navigation })),
      ),
    ).toBeInstanceOf(TransientInRenderError);
  });

  it('sees a transient contribution a later load() adds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create(
      [provide(DIAGNOSTICS, { useValue: { system: 'reactor' } })],
      { plugins: [react()] },
    );
    const first = hook(ship, () => useService(DIAGNOSTICS));
    first.unmount();
    await ship.load(
      defineModule({
        name: 'Hull',
        providers: [
          provide(DIAGNOSTICS, {
            useFactory: () => ({ system: 'hull' }),
            lifetime: 'transient',
          }),
        ],
        exports: [DIAGNOSTICS],
      }),
    );
    expect(
      thrown(() => hook(ship, () => useService(DIAGNOSTICS))),
    ).toBeInstanceOf(TransientInRenderError);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react -- plugin`
Expected: FAIL, `react` is not exported from `./index.js`.

- [ ] **Step 3: Implement** `libs/react/src/plugin.ts`

```ts
import {
  displayName,
  moduleDefinitionOf,
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type LookupOptions,
  type Nexus,
  type NexusPlugin,
  type ProviderView,
} from '@nexusdi/core';

import { transientInRender } from './errors.js';

/** One blueprint reader per container that registered react(). */
const readers = new WeakMap<Nexus, () => BlueprintView>();

interface ViewIndex {
  readonly byId: ReadonlyMap<string, ProviderView>;
  readonly aliasTarget: ReadonlyMap<string, string>;
  /** module id, then token, then the transient provider or null. */
  readonly results: Map<string, Map<unknown, ProviderView | null>>;
}

/** One index per published view: a load() publishes a new view object (core K2). */
const indexes = new WeakMap<BlueprintView, ViewIndex>();

function indexOf(view: BlueprintView): ViewIndex {
  let index = indexes.get(view);
  if (index === undefined) {
    index = {
      byId: new Map(view.providers.map((p) => [p.id, p])),
      aliasTarget: new Map(
        view.edges.filter((e) => e.kind === 'alias').map((e) => [e.from, e.to]),
      ),
      results: new Map(),
    };
    indexes.set(view, index);
  }
  return index;
}

/** The provider an alias chain ends at, or undefined for a broken chain. */
function target(index: ViewIndex, id: string): ProviderView | undefined {
  const seen = new Set<string>();
  let provider = index.byId.get(id);
  while (provider?.kind === 'alias') {
    if (seen.has(provider.id)) return undefined;
    seen.add(provider.id);
    const next = index.aliasTarget.get(provider.id);
    provider = next === undefined ? undefined : index.byId.get(next);
  }
  return provider;
}

/** The module core's get() selects for { module: ref }: the definition, or the module that replaced it (core K6). */
function moduleIdOf(view: BlueprintView, ref: unknown): string | undefined {
  const definition = moduleDefinitionOf(ref as never);
  if (definition === undefined) return undefined;
  return view.modules.find(
    (m) => m.definition === definition || m.replaced === definition,
  )?.id;
}

/**
 * Throws NEXUS_REACT_TRANSIENT_IN_RENDER when `token` binds a transient
 * provider, or a MultiToken has a transient contribution, before get() runs.
 * Does nothing for a container without react(), or when the view has no
 * provider: get() then throws its own error.
 */
export function checkTransient(
  container: Nexus,
  token: unknown,
  options?: LookupOptions,
): void {
  const read = readers.get(container);
  if (read === undefined) return;
  const view = read();
  const moduleId =
    options?.module === undefined
      ? view.root
      : moduleIdOf(view, options.module);
  if (moduleId === undefined) return;
  const index = indexOf(view);
  let byToken = index.results.get(moduleId);
  if (byToken === undefined) {
    byToken = new Map();
    index.results.set(moduleId, byToken);
  }
  let found = byToken.get(token);
  if (found === undefined) {
    found = null;
    for (const id of view.visible(moduleId, token as never)) {
      const provider = target(index, id);
      if (provider?.lifetime === 'transient') {
        found = provider;
        break;
      }
    }
    byToken.set(token, found);
  }
  if (found !== null) throw transientInRender(displayName(token), found.name);
}

/**
 * The transient check for useService (react spec 4.2 and 5). Register it in
 * development and tests, beside devtools(); the package reads no
 * environment variable.
 */
export function react(): NexusPlugin {
  return {
    name: 'nexusdi-react',
    apiVersion: NEXUS_PLUGIN_API,
    setup(context) {
      readers.set(context.container, () => context.blueprint());
    },
  };
}
```

In `libs/react/src/use-service.ts`, import `checkTransient` from `./plugin.js` and call it first in `useService`, after reading the context:

```ts
export function useService(
  token: InjectionToken<unknown> | MultiToken<unknown>,
  options?: LookupOptions,
): unknown {
  const { container, resolver, store } = useNexusContext('useService');
  checkTransient(container, token, options); // before get(): a rejected token builds nothing
  if (token instanceof MultiToken)
    return store.memo(
      resolver,
      token,
      options?.module,
      resolver.get(token, options),
    );
  return resolver.get(token, options);
}
```

Add to `libs/react/src/index.ts`: `export { react } from './plugin.js';`

In `libs/react/README.md`, register the plugin in the Quick Example: change the import to `import { NexusProvider, react } from '@nexusdi/react';`, change the call to `Nexus.create([provide(FLIGHT_LOG, { useClass: ShuttleFlightLog })], { plugins: [react()] })`, and add one sentence before the fence: "`react()` reads the graph when the container starts, so a transient token read in render fails on the first render, in development and tests."

If the test for `useExisting` fails because `EdgeView.from` and `to` hold something other than provider ids, read `libs/core/src/blueprint/views.ts` `buildView` and key `aliasTarget` the way it builds edges; the test pins the behaviour, not this map.

- [ ] **Step 4: Run the tests and the repo checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/react && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- error-text-placement`
Expected: PASS, the README doctest of Task 11 included.

- [ ] **Step 5: Commit**

```bash
git add libs/react
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(react): reject transient tokens in render with the react() plugin

react() keeps a reader of the container's blueprint view. useService asks
it before get(), follows alias edges, checks every MultiToken contribution
and resolves { module } to the module that replaced it, so a transient read
in render fails on the first render and builds nothing. The result is
cached per view, and a load() publishes a new view.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `ScopeProvider`

Files:

- Create: `libs/react/src/scope-provider.tsx`
- Modify: `libs/react/src/store.ts`, `libs/react/src/index.ts`
- Test: `libs/react/src/scope-provider.test.tsx`

Interfaces:

- Consumes: `NexusContext`, `useNexusContext`, `useHydrated`, `deferred`, `report`, `nestedScope`, `Store` from Tasks 11 and 12.
- Produces: `ScopeProvider(props: ScopeProviderProps): ReactElement`, `ScopeProviderProps = { request?: NexusRequest; fallback?: ReactNode; children?: ReactNode }`; `Store` gains `readonly live: Set<Scope>`, `loads: number`, `extendAll(): Promise<void>`, used by Task 14.

- [ ] **Step 1: Write the failing test** `libs/react/src/scope-provider.test.tsx`

```tsx
import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NestedScopeError,
  NexusProvider,
  ScopeProvider,
  useService,
} from './index.js';
import { Boundary } from './support/boundary.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<{ sectors: readonly string[] }>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const survey: NexusRequest = {
  mission: { id: 'survey-7', target: 'Kepler-442b' },
} as never;

function shipWith(events: TraceEvent[]) {
  return Nexus.create(
    [
      provide(MISSION, {
        useFactory: (request: NexusRequest) =>
          (request as unknown as { mission: Mission }).mission,
        deps: [REQUEST],
        lifetime: 'scoped',
      }),
      provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    ],
    { plugins: [trace((event) => events.push(event))] },
  );
}

function LogPanel() {
  const log = useService(FLIGHT_LOG);
  log.record('arrived');
  return <p>{log.entries()[0]}</p>;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const count = (events: TraceEvent[], type: string) =>
  events.filter((e) => e.type === type).length;

afterEach(() => vi.restoreAllMocks());

describe('ScopeProvider', () => {
  it('renders fallback, then the subtree with its own scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <NexusProvider container={ship}>
        <ScopeProvider request={survey} fallback={<p>Docking</p>}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>,
    );
    expect(screen.getByText('Docking')).toBeTruthy();
    expect(await screen.findByText('survey-7: arrived')).toBeTruthy();
    view.unmount();
  });

  it('keeps one scope through StrictMode and disposes it on unmount', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey} fallback={<p>Docking</p>}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </StrictMode>,
    );
    await screen.findByText(/survey-7/);
    await tick();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(0);
    view.unmount();
    await tick();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('gives two sibling providers two scopes', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <NexusProvider container={ship}>
        <ScopeProvider request={survey}>
          <LogPanel />
        </ScopeProvider>
        <ScopeProvider request={survey}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>,
    );
    expect(await screen.findAllByText('survey-7: arrived')).toHaveLength(2);
    expect(count(events, 'scope:create')).toBe(2);
    view.unmount();
  });

  it('reads request once, so a new object makes no new scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const tree = (request: NexusRequest) => (
      <NexusProvider container={ship}>
        <ScopeProvider request={request}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>
    );
    const view = render(tree(survey));
    await screen.findByText(/survey-7/);
    view.rerender(
      tree({ mission: { id: 'survey-8', target: 'Kepler-442b' } } as never),
    );
    await tick();
    expect(count(events, 'scope:create')).toBe(1);
    view.unmount();
  });

  it('throws a rejected createScope to the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <Boundary>
        <NexusProvider container={ship}>
          <ScopeProvider fallback={<p>Docking</p>}>
            <LogPanel />
          </ScopeProvider>
        </NexusProvider>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REQUEST_MISSING',
    );
    view.unmount();
  });

  it('throws NEXUS_REACT_NESTED_SCOPE under a scope after hydration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const view = render(
      <Boundary>
        <NexusProvider container={ship}>
          <ScopeProvider request={survey}>
            <ScopeProvider request={survey}>
              <LogPanel />
            </ScopeProvider>
          </ScopeProvider>
        </NexusProvider>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'NEXUS_REACT_NESTED_SCOPE',
    );
    expect(NestedScopeError).toBeDefined();
    view.unmount();
  });

  it('renders fallback on the server, also under a provider given scope', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    await using request = await ship.createScope({ request: survey });
    const stream = await renderToReadableStream(
      <NexusProvider container={ship} scope={request}>
        <ScopeProvider request={survey} fallback={<p>Docking</p>}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>,
    );
    const html = await new Response(stream).text();
    expect(html).toContain('Docking');
    expect(count(events, 'scope:create')).toBe(1); // the request scope only
  });

  it('extends a live scope after a load, so section tokens resolve', async () => {
    const events: TraceEvent[] = [];
    await using ship = await shipWith(events);
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [
        provide(NAV_ROUTES, {
          useFactory: () => ({ sectors: ['alpha'] }),
          lifetime: 'scoped',
        }),
      ],
      exports: [NAV_ROUTES],
    });
    function Routes() {
      return <p>{useService(NAV_ROUTES).sectors.join(',')}</p>;
    }
    const view = render(
      <NexusProvider container={ship}>
        <ScopeProvider request={survey}>
          <LogPanel />
        </ScopeProvider>
      </NexusProvider>,
    );
    await screen.findByText(/survey-7/);
    const { storeFor } = await import('./store.js');
    await ship.load(Navigation);
    await storeFor(ship).extendAll();
    view.rerender(
      <NexusProvider container={ship}>
        <ScopeProvider request={survey}>
          <LogPanel />
          <Routes />
        </ScopeProvider>
      </NexusProvider>,
    );
    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(count(events, 'scope:extend')).toBe(1); // no NEXUS_LOADED_AFTER_SCOPE
    view.unmount();
  });
});
```

`react-dom/server.edge` gives `renderToReadableStream` under Node and jsdom; if the jsdom environment lacks `ReadableStream` on its global, add `// @vitest-environment node` as the first line of a separate file `scope-provider.server.test.tsx` that holds only the server test.

- [ ] **Step 2: Run it and see it fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react -- scope-provider`
Expected: FAIL, `ScopeProvider` is not exported.

- [ ] **Step 3: Implement**

Add to `libs/react/src/store.ts`, inside `class Store`:

```ts
  /** The scopes ScopeProviders of this container hold, settled and not disposed. */
  readonly live = new Set<Scope>();
  /** How many loads the package ran; a scope created before the latest one extends. */
  loads = 0;

  /** extend() on every live scope (react spec 6.5). */
  async extendAll(): Promise<void> {
    await Promise.all([...this.live].map((scope) => scope.extend()));
  }
```

`libs/react/src/scope-provider.tsx`:

```tsx
import type { NexusRequest, Scope } from '@nexusdi/core';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  NexusContext,
  useNexusContext,
  type NexusContextValue,
} from './context.js';
import { nestedScope } from './errors.js';
import { useHydrated } from './hydrated.js';
import { deferred, type Lease } from './release.js';
import type { Store } from './store.js';

export interface ScopeProviderProps {
  /** Read once, when the scope is created. Remount with a key for new request data. */
  request?: NexusRequest;
  fallback?: ReactNode;
  children?: ReactNode;
}

interface Holder extends Lease {
  readonly store: Store;
  scope: Scope | undefined;
  error: unknown;
  failed: boolean;
  disposed: boolean;
}

function hold(
  store: Store,
  request: NexusRequest | undefined,
  settled: () => void,
): Holder {
  const loadsAtStart = store.loads;
  let disposeScope: () => Promise<void> = async () => undefined;
  const lease = deferred(() => {
    holder.disposed = true;
    return disposeScope();
  });
  const holder: Holder = {
    store,
    scope: undefined,
    error: undefined,
    failed: false,
    disposed: false,
    acquire: lease.acquire,
    release: lease.release,
  };
  const created = store.container
    .createScope({ request })
    .then(async (scope) => {
      if (store.loads !== loadsAtStart) await scope.extend(); // a section loaded while this scope was pending
      return scope;
    });
  disposeScope = () =>
    created.then(
      async (scope) => {
        store.live.delete(scope);
        await scope[Symbol.asyncDispose]();
      },
      () => undefined,
    );
  created.then(
    (scope) => {
      if (holder.disposed) return;
      holder.scope = scope;
      store.live.add(scope);
      settled();
    },
    (error: unknown) => {
      if (holder.disposed) return;
      holder.error = error;
      holder.failed = true;
      settled();
    },
  );
  return holder;
}

export function ScopeProvider({
  request,
  fallback = null,
  children,
}: ScopeProviderProps): ReactElement {
  const outer = useNexusContext('ScopeProvider');
  const hydrated = useHydrated();
  const requestRef = useRef(request);
  const holderRef = useRef<Holder | null>(null);
  const [, settled] = useReducer((n: number) => n + 1, 0);

  if (hydrated && outer.scoped) throw nestedScope();

  useEffect(() => {
    if (!hydrated) return;
    let holder = holderRef.current;
    if (holder === null || holder.disposed || holder.store !== outer.store) {
      holder = hold(outer.store, requestRef.current, settled);
      holderRef.current = holder;
    }
    holder.acquire();
    const held = holder;
    return () => held.release();
  }, [hydrated, outer.store]);

  const holder = holderRef.current;
  const scope = holder?.store === outer.store ? holder.scope : undefined;
  const value = useMemo<NexusContextValue | null>(
    () =>
      scope === undefined
        ? null
        : {
            container: outer.container,
            resolver: scope,
            store: outer.store,
            scoped: true,
          },
    [scope, outer.container, outer.store],
  );

  if (holder?.failed === true && holder.store === outer.store)
    throw holder.error;
  if (!hydrated || value === null) return <>{fallback}</>;
  return <NexusContext value={value}>{children}</NexusContext>;
}
```

The deferred release routes a disposal error to `report` (Task 11), so this file imports no reporter.

Add to `libs/react/src/index.ts`: `export { ScopeProvider, type ScopeProviderProps } from './scope-provider.js';`

- [ ] **Step 4: Run the tests**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/react`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/react
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(react): give a subtree its own scope with ScopeProvider

ScopeProvider creates its scope in an effect after hydration and renders
its fallback until the scope settles. The deferred release keeps one scope
through StrictMode, and a real unmount disposes it. Under another scope it
throws NEXUS_REACT_NESTED_SCOPE after hydration, and on the server it
renders its fallback, also under a provider given the request scope.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `lazySection` and `SectionBoundary`

Files:

- Create: `libs/react/src/section.tsx`, `libs/react/src/dev.ts`
- Modify: `libs/react/src/store.ts`, `libs/react/src/index.ts`, `tools/repo-checks/src/core-layers.ts`, `tools/repo-checks/src/core-layers.test.ts`
- Test: `libs/react/src/section.test.tsx`

Interfaces:

- Consumes: `Store` with `live`, `loads`, `extendAll()` from Task 13; `sectionConflict` from Task 11; `moduleDefinitionOf` from `@nexusdi/core`.
- Produces: `lazySection(name: string, loader: () => Promise<ModuleRef>): LazySection` with `LazySection = { readonly name: string; readonly loader: () => Promise<ModuleRef> }`; `SectionBoundary(props: SectionBoundaryProps): ReactElement` with `SectionBoundaryProps = { section: LazySection; fallback?: ReactNode; errorFallback?: ComponentType<{ error: unknown; retry(): void }>; onError?(error: unknown): void; children?: ReactNode }`; internal `dev: boolean` in `dev.ts`.

The dev reload guard reads `process.env.NODE_ENV` (react spec 12.3 and 16). `core-layers.ts` `nodeViolations` refuses `process` in every package but `node/` and `cli/`. This task adds one named exception for `react/src/dev.ts`, the only file that reads it, with the reason that every React toolchain replaces `process.env.NODE_ENV` at build time, as React itself relies on. The spec owner of `core-layers` (core spec section 12) takes the change as part of this plan; Task 28's checklist records it.

- [ ] **Step 1: Write the failing tests**

Add to `tools/repo-checks/src/core-layers.test.ts`, in the `nodeViolations` describe block:

```ts
it('lets react/src/dev.ts read process.env.NODE_ENV and nothing else in react', () => {
  expect(
    nodeViolations([
      {
        path: 'react/src/dev.ts',
        source: "export const dev = process.env.NODE_ENV !== 'production';",
      },
      {
        path: 'react/src/section.tsx',
        source: 'const x = process.env.NODE_ENV;',
      },
    ]),
  ).toEqual([
    'react/src/section.tsx references process; only node/ and cli/ may',
  ]);
});
```

`libs/react/src/section.test.tsx`:

```tsx
import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { createTestingContainer } from '@nexusdi/testing';
import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  lazySection,
  NexusProvider,
  ScopeProvider,
  SectionBoundary,
  useService,
} from './index.js';
import { Boundary } from './support/boundary.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };
const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
  exports: [NAV_CHARTS],
});

function Heading() {
  return <p>{useService(NAV_CHARTS).plot('Kepler-442b').heading}</p>;
}
function Failed({ error, retry }: { error: unknown; retry(): void }) {
  return (
    <button type="button" onClick={retry}>
      {(error as Error).message}
    </button>
  );
}
const loadEvents = (events: TraceEvent[]) =>
  events.filter(
    (e) => e.type === 'compile' && (e as { phase?: string }).phase === 'load',
  ).length;

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('SectionBoundary', () => {
  it('loads the section once for two boundaries, under StrictMode', async () => {
    const events: TraceEvent[] = [];
    await using ship = await Nexus.create([], {
      plugins: [trace((e) => events.push(e))],
    });
    const loader = vi.fn(async () => Navigation);
    const section = lazySection('navigation', loader);
    const view = render(
      <StrictMode>
        <NexusProvider container={ship}>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Heading />
          </SectionBoundary>
          <SectionBoundary section={section} fallback={<p>Loading</p>}>
            <Heading />
          </SectionBoundary>
        </NexusProvider>
      </StrictMode>,
    );
    expect(await screen.findAllByText('42')).toHaveLength(2);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loadEvents(events)).toBe(1);
    view.unmount();
  });

  it('renders the next mount at once from the cache', async () => {
    await using ship = await Nexus.create([]);
    const section = lazySection('navigation', async () => Navigation);
    const tree = (
      <NexusProvider container={ship}>
        <SectionBoundary section={section} fallback={<p>Loading</p>}>
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const first = render(tree);
    await screen.findByText('42');
    first.unmount();
    const second = render(tree);
    expect(screen.queryByText('Loading')).toBeNull();
    second.unmount();
  });

  it('shows errorFallback on a load failure, calls onError once, and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    let attempt = 0;
    const section = lazySection('navigation', async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('remote down');
      return Navigation;
    });
    const onError = vi.fn();
    const view = render(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={section}
          errorFallback={Failed}
          onError={onError}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    const button = await screen.findByRole('button');
    expect(button.textContent).toBe('remote down');
    expect(onError).toHaveBeenCalledTimes(1);
    await act(async () => button.click());
    expect(await screen.findByText('42')).toBeTruthy();
    view.unmount();
  });

  it('shows a BlueprintError from load() in errorFallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: (missing: string) => fakeCharts,
          deps: [new Token<string>('Missing')],
        }),
      ],
      exports: [NAV_CHARTS],
    });
    let seen: unknown;
    function Capture({ error }: { error: unknown; retry(): void }) {
      seen = error;
      return <p>failed</p>;
    }
    const view = render(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('broken', async () => Broken)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    await screen.findByText('failed');
    expect(isNexusError(seen, 'NEXUS_BLUEPRINT_INVALID')).toBe(true);
    view.unmount();
  });

  it('sends a component error to the app boundary above', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    function Explodes(): null {
      throw new Error('panel fault');
    }
    const view = render(
      <Boundary>
        <NexusProvider container={ship}>
          <SectionBoundary
            section={lazySection('navigation', async () => Navigation)}
            errorFallback={Failed}
          >
            <Explodes />
          </SectionBoundary>
        </NexusProvider>
      </Boundary>,
    );
    expect((await screen.findByRole('alert')).textContent).toBe('panel fault');
    view.unmount();
  });

  it('extends live scopes before the section renders', async () => {
    const SCOPED_CHARTS = new Token<INavCharts>('ScopedCharts');
    const ScopedNavigation = defineModule({
      name: 'ScopedNavigation',
      providers: [
        provide(SCOPED_CHARTS, {
          useFactory: () => fakeCharts,
          lifetime: 'scoped',
        }),
      ],
      exports: [SCOPED_CHARTS],
    });
    function ScopedHeading() {
      return <p>{useService(SCOPED_CHARTS).plot('Kepler-442b').heading}</p>;
    }
    await using ship = await Nexus.create([]);
    const view = render(
      <NexusProvider container={ship}>
        <ScopeProvider>
          <SectionBoundary
            section={lazySection('navigation', async () => ScopedNavigation)}
          >
            <ScopedHeading />
          </SectionBoundary>
        </ScopeProvider>
      </NexusProvider>,
    );
    expect(await screen.findByText('42')).toBeTruthy();
    view.unmount();
  });

  it('fails with NEXUS_REACT_SECTION_CONFLICT for two module names under one section name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await using ship = await Nexus.create([]);
    const Other = defineModule({ name: 'Other', providers: [] });
    let seen: unknown;
    function Capture({ error }: { error: unknown; retry(): void }) {
      seen = error;
      return <p>conflict</p>;
    }
    const view = render(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => Navigation)}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    await screen.findByText('42');
    view.rerender(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => Other)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    await screen.findByText('conflict');
    expect(isNexusError(seen, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    view.unmount();
  });

  it('reloads once in development for an edited section module, then reports the conflict', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await using ship = await Nexus.create([]);
    const edited = defineModule({
      name: 'Navigation',
      providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
      exports: [NAV_CHARTS],
    });
    let seen: unknown;
    function Capture({ error }: { error: unknown; retry(): void }) {
      seen = error;
      return <p>conflict</p>;
    }
    const tree = (loader: () => Promise<typeof Navigation>) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', loader)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = render(tree(async () => Navigation));
    await screen.findByText('42');
    view.rerender(tree(async () => edited));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(sessionStorage.getItem('nexusdi:section-reload') ?? '{}')
        .section,
    ).toBe('navigation');
    view.rerender(tree(async () => edited));
    await screen.findByText('conflict');
    expect(isNexusError(seen, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    expect(sessionStorage.getItem('nexusdi:section-reload')).toBeNull();
    vi.unstubAllGlobals();
    view.unmount();
  });

  it('reports the conflict without a reload when storage throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await using ship = await Nexus.create([]);
    const edited = defineModule({ name: 'Navigation', providers: [] });
    let seen: unknown;
    function Capture({ error }: { error: unknown; retry(): void }) {
      seen = error;
      return <p>conflict</p>;
    }
    const tree = (loader: () => Promise<typeof Navigation>) => (
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', loader)}
          errorFallback={Capture}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>
    );
    const view = render(tree(async () => Navigation));
    await screen.findByText('42');
    view.rerender(tree(async () => edited));
    await screen.findByText('conflict');
    expect(reload).not.toHaveBeenCalled();
    expect(isNexusError(seen, 'NEXUS_REACT_SECTION_CONFLICT')).toBe(true);
    vi.unstubAllGlobals();
    view.unmount();
  });

  it('loads the stub of overrideModule with { lazy: true }', async () => {
    const Stub = defineModule({
      name: 'NavigationStub',
      providers: [
        provide(NAV_CHARTS, {
          useValue: { plot: (to) => ({ to, heading: 7 }) },
        }),
      ],
      exports: [NAV_CHARTS],
    });
    await using ship = await createTestingContainer(
      defineModule({ name: 'Meridian' }),
    )
      .overrideModule(Navigation, Stub, { lazy: true })
      .create();
    const view = render(
      <NexusProvider container={ship}>
        <SectionBoundary
          section={lazySection('navigation', async () => Navigation)}
        >
          <Heading />
        </SectionBoundary>
      </NexusProvider>,
    );
    expect(await screen.findByText('7')).toBeTruthy();
    view.unmount();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react -- section && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- core-layers`
Expected: FAIL, `lazySection` is not exported, and `nodeViolations` reports `react/src/dev.ts`.

- [ ] **Step 3: Implement**

In `tools/repo-checks/src/core-layers.ts`, below `NODE_ONLY`:

```ts
/**
 * Single files outside NODE_ONLY that may read process.env.NODE_ENV and no
 * other process member. Every React toolchain replaces that expression at
 * build time, and React itself relies on it (react spec 12.3, 16).
 */
const NODE_ENV_READERS = ['react/src/dev.ts'];
```

and in `nodeViolations`, at the top of the loop body:

```ts
if (NODE_ENV_READERS.includes(file.path)) {
  const text = file.source.replace(/process\.env\.NODE_ENV/g, '');
  if (
    !/\bprocess\b/.test(text) &&
    !specifiersOf(parseFile(file)).some((s) => s.startsWith('node:'))
  )
    continue;
}
```

`libs/react/src/dev.ts`:

```ts
// The one read of the environment in the package; tools/repo-checks
// core-layers.ts names this file. Bundlers replace the expression.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** True in development and tests; false in a production build. */
export const dev = process.env.NODE_ENV !== 'production';
```

Add to `class Store` in `libs/react/src/store.ts`:

```ts
  /** Section name to its cache entry (react spec 7.1, 12.3). */
  readonly sections = new Map<string, SectionEntry>();
```

and above the class:

```ts
import type { ModuleRef } from '@nexusdi/core';

export interface SectionEntry {
  /** The LazySection object that started or confirmed this entry. */
  section: object;
  /** Resolves when the module is loaded and every live scope extended. */
  readonly promise: Promise<void>;
  /** The module object the loader returned, once it has. */
  module: ModuleRef | undefined;
}
```

`libs/react/src/section.tsx`:

```tsx
import { moduleDefinitionOf, type ModuleRef } from '@nexusdi/core';
import {
  Component,
  Suspense,
  use,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useNexusContext } from './context.js';
import { dev } from './dev.js';
import { sectionConflict } from './errors.js';
import { useHydrated } from './hydrated.js';
import type { SectionEntry, Store } from './store.js';

export interface LazySection {
  readonly name: string;
  readonly loader: () => Promise<ModuleRef>;
}

/** A module-level handle: a name and a loader. Runs nothing. */
export function lazySection(
  name: string,
  loader: () => Promise<ModuleRef>,
): LazySection {
  return Object.freeze({ name, loader });
}

export interface SectionBoundaryProps {
  section: LazySection;
  fallback?: ReactNode;
  errorFallback?: ComponentType<{ error: unknown; retry(): void }>;
  onError?(error: unknown): void;
  children?: ReactNode;
}

/** The marker on a load failure, so the boundary tells it from a component error. */
class LoadFailure {
  constructor(readonly error: unknown) {}
}

const RELOAD_KEY = 'nexusdi:section-reload';
const RELOAD_WINDOW_MS = 10_000;

/** 'reload' when a fresh reload may clear the conflict; 'conflict' otherwise (react spec 12.3). */
function reloadOrConflict(name: string): 'reload' | 'conflict' {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const last =
      raw === null
        ? undefined
        : (JSON.parse(raw) as { section?: string; at?: number });
    if (
      last?.section === name &&
      typeof last.at === 'number' &&
      Date.now() - last.at < RELOAD_WINDOW_MS
    ) {
      sessionStorage.removeItem(RELOAD_KEY);
      return 'conflict';
    }
    sessionStorage.setItem(
      RELOAD_KEY,
      JSON.stringify({ section: name, at: Date.now() }),
    );
    return 'reload';
  } catch {
    return 'conflict';
  }
}

function load(store: Store, section: LazySection): SectionEntry {
  const entry: SectionEntry = {
    section,
    module: undefined,
    promise: section.loader().then(async (module) => {
      entry.module = module;
      await store.container.load(module);
      store.loads += 1;
      await store.extendAll();
    }),
  };
  return entry;
}

/** A known name with a new LazySection object: compare module objects (react spec 12.3). */
function confirm(
  store: Store,
  known: SectionEntry,
  section: LazySection,
): SectionEntry {
  const promise = known.promise
    .then(() => section.loader())
    .then((module) => {
      if (module === known.module) {
        known.section = section;
        return;
      }
      const before =
        known.module === undefined
          ? undefined
          : moduleDefinitionOf(known.module)?.name;
      const after = moduleDefinitionOf(module)?.name;
      if (before !== after || !dev) throw sectionConflict(section.name);
      if (reloadOrConflict(section.name) === 'conflict')
        throw sectionConflict(section.name);
      console.info(
        `[@nexusdi/react] section '${section.name}' changed; reloading the page`,
      );
      location.reload();
      return new Promise<void>(() => undefined); // the page is going away
    });
  return { section, module: known.module, promise };
}

function entryFor(store: Store, section: LazySection): SectionEntry {
  const known = store.sections.get(section.name);
  if (known === undefined) {
    const entry = load(store, section);
    store.sections.set(section.name, entry);
    return entry;
  }
  if (known.section === section) return known;
  const entry = confirm(store, known, section);
  store.sections.set(section.name, entry);
  return entry;
}

/** One promise per entry that rejects with a LoadFailure, so use() rethrows a marked error. */
const marked = new WeakMap<SectionEntry, Promise<void>>();
function markedPromise(entry: SectionEntry): Promise<void> {
  let promise = marked.get(entry);
  if (promise === undefined) {
    promise = entry.promise.catch((error: unknown) => {
      throw new LoadFailure(error);
    });
    marked.set(entry, promise);
  }
  return promise;
}

function Gate({
  entry,
  children,
}: {
  entry: SectionEntry;
  children?: ReactNode;
}): ReactElement {
  use(markedPromise(entry));
  return <>{children}</>;
}

interface CatcherProps {
  readonly store: Store;
  readonly name: string;
  readonly errorFallback?: ComponentType<{ error: unknown; retry(): void }>;
  readonly onError?: (error: unknown) => void;
  readonly onRetry: () => void;
  readonly children?: ReactNode;
}

class Catcher extends Component<CatcherProps, { failure: unknown }> {
  override state: { failure: unknown } = { failure: null };

  static getDerivedStateFromError(error: unknown) {
    return { failure: error };
  }

  override componentDidCatch(error: unknown) {
    if (!(error instanceof LoadFailure)) return;
    this.props.store.sections.delete(this.props.name); // the next render loads afresh
    this.props.onError?.(error.error);
  }

  override render() {
    const { failure } = this.state;
    if (failure === null) return this.props.children;
    if (!(failure instanceof LoadFailure)) throw failure; // a component error goes to the app's boundary
    const Fallback = this.props.errorFallback;
    if (Fallback === undefined) throw failure.error;
    return (
      <Fallback
        error={failure.error}
        retry={() => {
          this.setState({ failure: null });
          this.props.onRetry();
        }}
      />
    );
  }
}

export function SectionBoundary({
  section,
  fallback = null,
  errorFallback,
  onError,
  children,
}: SectionBoundaryProps): ReactElement {
  const { store } = useNexusContext('SectionBoundary');
  const hydrated = useHydrated();
  const [attempt, setAttempt] = useState(0);
  if (!hydrated) return <>{fallback}</>;
  const entry = entryFor(store, section);
  return (
    <Catcher
      key={attempt}
      store={store}
      name={section.name}
      errorFallback={errorFallback}
      onError={onError}
      onRetry={() => setAttempt((n) => n + 1)}
    >
      <Suspense fallback={fallback}>
        <Gate entry={entry}>{children}</Gate>
      </Suspense>
    </Catcher>
  );
}
```

`entryFor` writes the store's cache in render. The write is idempotent per `(container, name, LazySection object)`, so a discarded or doubled render stores the same entry; the spec accepts this for the section cache (react spec 7.1, step 2).

Add to `libs/react/src/index.ts`:

```ts
export {
  lazySection,
  SectionBoundary,
  type LazySection,
  type SectionBoundaryProps,
} from './section.js';
```

- [ ] **Step 4: Run the tests and the repo checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck -p @nexusdi/react && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- core-layers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/react tools/repo-checks/src/core-layers.ts tools/repo-checks/src/core-layers.test.ts
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(react): load lazy sections with SectionBoundary

lazySection names a loader, and SectionBoundary loads the module into the
container once per section name, extends every live scope, and renders its
children inside Suspense. A load failure renders errorFallback with a
retry, and a component error goes to the app's boundary. An edited section
module reloads the page once in development, guarded by sessionStorage.
core-layers lets react/src/dev.ts read process.env.NODE_ENV.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: SSR, hydration, HMR, the React 19.0 leg and the README

Files:

- Create: `libs/react/src/__fixtures__/rr8/` (a React Router 8 app: `package.json`, `react-router.config.ts`, `vite.config.ts`, `app/root.tsx`, `app/routes.ts`, `app/routes/course.tsx`, `app/entry.server.tsx`, `app/entry.client.tsx`, `app/nexus.server.ts`, `app/ship.client.ts`, `app/bridge/contracts.ts`, `app/bridge/server.module.ts`, `app/bridge/client.module.ts`), `libs/react/src/__fixtures__/next16/` (`package.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/providers.tsx`, `app/ship.client.ts`, `app/misuse/page.tsx`), `libs/react/src/__fixtures__/hmr/` (`index.html`, `vite.config.ts`, `src/main.tsx`, `src/ship.ts`, `src/flight-log.ts`, `src/contracts.ts`, `src/app.tsx`)
- Test: `libs/react/src/ssr.test.tsx`, `libs/react/src/react.e2e.test.ts`, `libs/react/src/hmr.e2e.test.ts`
- Modify: `libs/react/project.json` (target `e2e`), `libs/react/vite.config.ts` (an `e2e` project), `libs/react/README.md`, `libs/react/docs/examples.md`, `scripts/verify-packaging.mjs` (the `'use client'` check)

Interfaces:

- Consumes: everything of Tasks 11 to 14; `NEXUS_SCOPE` and `nexus` from `@nexusdi/react-router` (Task 9).
- Produces: the `e2e` target of `@nexusdi/react`, which Task 23's `adapter-peers` job runs on `react@19.0.0` and the latest 19.x, and the confirmation of react spec 9.1's open item (React Router 8 passes the middleware `RouterContextProvider` as `loadContext` to `handleRequest`).

- [ ] **Step 1: Write the failing SSR unit test** `libs/react/src/ssr.test.tsx`

```tsx
// @vitest-environment node
import {
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';
import { renderToReadableStream } from 'react-dom/server.edge';
import { describe, expect, it } from 'vitest';

import {
  NexusProvider,
  ScopeProvider,
  SectionBoundary,
  lazySection,
  useService,
} from './index.js';

interface Mission {
  id: string;
  target: string;
}
const MISSION = new Token<Mission>('Mission');

function MissionId() {
  return <p>{useService(MISSION).id}</p>;
}
const html = async (node: React.ReactNode) =>
  new Response(await renderToReadableStream(node)).text();

describe('server rendering', () => {
  it('resolves scoped tokens from the scope prop', async () => {
    await using ship = await Nexus.create([
      provide(MISSION, {
        useFactory: (r: NexusRequest) =>
          (r as unknown as { mission: Mission }).mission,
        deps: [REQUEST],
        lifetime: 'scoped',
      }),
    ]);
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } } as never,
    });
    expect(
      await html(
        <NexusProvider container={ship} scope={scope}>
          <MissionId />
        </NexusProvider>,
      ),
    ).toContain('survey-7');
  });

  it('renders fallbacks for ScopeProvider, SectionBoundary and clientOnly', async () => {
    await using ship = await Nexus.create([]);
    const section = lazySection('navigation', async () => {
      throw new Error('must not load on the server');
    });
    const out = await html(
      <>
        <NexusProvider container={ship}>
          <ScopeProvider fallback={<p>Docking</p>}>
            <p>never</p>
          </ScopeProvider>
          <SectionBoundary section={section} fallback={<p>Loading section</p>}>
            <p>never</p>
          </SectionBoundary>
        </NexusProvider>
        <NexusProvider
          container={ship}
          clientOnly
          fallback={<p>Console skeleton</p>}
        >
          <p>never</p>
        </NexusProvider>
      </>,
    );
    expect(out).toContain('Docking');
    expect(out).toContain('Loading section');
    expect(out).toContain('Console skeleton');
    expect(out).not.toContain('never');
  });
});
```

- [ ] **Step 2: Write the React Router 8 fixture**

`libs/react/src/__fixtures__/rr8/package.json`:

```json
{
  "name": "@nexusdi/react-fixture-rr8",
  "private": true,
  "type": "module",
  "dependencies": {
    "@nexusdi/core": "*",
    "@nexusdi/react": "*",
    "@nexusdi/react-router": "*",
    "@react-router/node": "^8.4.0",
    "@react-router/serve": "^8.4.0",
    "isbot": "^5.1.0",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-router": "^8.4.0"
  },
  "devDependencies": { "@react-router/dev": "^8.4.0" }
}
```

The fixture is not a workspace: `react.e2e.test.ts` installs it into a temporary directory with the packed tarballs, like `scripts/verify-packaging.mjs` does.

`app/bridge/contracts.ts`:

```ts
import { Token } from '@nexusdi/core';

export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
```

`app/bridge/server.module.ts` binds `FLIGHT_LOG` scoped, `app/bridge/client.module.ts` binds it as a singleton (react spec 9.1's lifetime rule):

```ts
// server.module.ts
import { defineModule, provide } from '@nexusdi/core';
import { FLIGHT_LOG, type IFlightLog } from './contracts';

class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = ['rendered on the server'];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

export const BridgeServer = defineModule({
  name: 'BridgeServer',
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
```

```ts
// client.module.ts
import { defineModule, provide } from '@nexusdi/core';
import { FLIGHT_LOG, type IFlightLog } from './contracts';

class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = ['rendered on the server'];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

export const BridgeClient = defineModule({
  name: 'BridgeClient',
  providers: [provide(FLIGHT_LOG, { useClass: MemoryFlightLog })],
  exports: [FLIGHT_LOG],
});
```

Both lists start with the same entry, so the server HTML and the hydration render match.

`app/nexus.server.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { BridgeServer } from './bridge/server.module';

export const ship = await Nexus.create(BridgeServer);
export const di = nexus(ship);
```

`app/ship.client.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { BridgeClient } from './bridge/client.module';

export const shipReady = Nexus.create(BridgeClient);
```

`app/root.tsx`:

```tsx
import { Links, Meta, Outlet, Scripts } from 'react-router';
import { di } from './nexus.server';

export const middleware = [di.middleware];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

`app/routes.ts`:

```ts
import { index, type RouteConfig } from '@react-router/dev/routes';

export default [index('routes/course.tsx')] satisfies RouteConfig;
```

`app/routes/course.tsx`:

```tsx
import { useService } from '@nexusdi/react';
import { FLIGHT_LOG } from '../bridge/contracts';

export default function Course() {
  const log = useService(FLIGHT_LOG);
  return <p id="log">{log.entries()[0]}</p>;
}
```

`app/entry.server.tsx` (react spec 9.1; the line that reads `loadContext.get(NEXUS_SCOPE)` is the open item this task closes):

```tsx
import { NexusProvider } from '@nexusdi/react';
import { NEXUS_SCOPE } from '@nexusdi/react-router';
import { renderToReadableStream } from 'react-dom/server';
import {
  ServerRouter,
  type EntryContext,
  type RouterContextProvider,
} from 'react-router';
import { ship } from './nexus.server';

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const scope = await loadContext.get(NEXUS_SCOPE).scope();
  const body = await renderToReadableStream(
    <NexusProvider container={ship} scope={scope}>
      <ServerRouter context={routerContext} url={request.url} />
    </NexusProvider>,
    { signal: request.signal },
  );
  await body.allReady;
  headers.set('Content-Type', 'text/html');
  return new Response(body, { status, headers });
}
```

`app/entry.client.tsx`:

```tsx
import { NexusProvider } from '@nexusdi/react';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { shipReady } from './ship.client';

const ship = await shipReady;
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <NexusProvider container={ship}>
        <HydratedRouter />
      </NexusProvider>
    </StrictMode>,
  );
});
```

`react-router.config.ts`: `export default { ssr: true };`. `vite.config.ts`: `import { reactRouter } from '@react-router/dev/vite'; import { defineConfig } from 'vite'; export default defineConfig({ plugins: [reactRouter()] });`

If the React Router 8 `handleRequest` does not receive the middleware `RouterContextProvider` as its fifth argument, stop and record it in the ledger: react spec 9.1 then hands the item to the integrations spec, and `@nexusdi/react-router` needs an export that gives the entry the request scope. Do not work around it in the fixture.

- [ ] **Step 3: Write the Next 16 fixture**

`libs/react/src/__fixtures__/next16/package.json`:

```json
{
  "name": "@nexusdi/react-fixture-next16",
  "private": true,
  "type": "module",
  "dependencies": {
    "@nexusdi/core": "*",
    "@nexusdi/react": "*",
    "next": "16.4.1",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  }
}
```

`app/ship.client.ts`:

```ts
import { Nexus, Token, provide } from '@nexusdi/core';

export interface IFlightLog {
  entries(): readonly string[];
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

(globalThis as { __nexusClientCreates?: number }).__nexusClientCreates = 0;

export const shipReady =
  typeof window === 'undefined'
    ? null
    : (() => {
        (
          globalThis as { __nexusClientCreates?: number }
        ).__nexusClientCreates! += 1;
        return Nexus.create([
          provide(FLIGHT_LOG, {
            useValue: { entries: () => ['bridge online'] },
          }),
        ]);
      })();
```

`app/providers.tsx`:

```tsx
'use client';
import { NexusProvider } from '@nexusdi/react';
import type { ReactNode } from 'react';
import { shipReady } from './ship.client';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NexusProvider
      container={shipReady}
      clientOnly
      dispose
      fallback={<p>Console skeleton</p>}
    >
      {children}
    </NexusProvider>
  );
}
```

`app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`app/page.tsx`:

```tsx
'use client';
import { useService } from '@nexusdi/react';
import { FLIGHT_LOG } from './ship.client';

export default function Page() {
  return <p id="log">{useService(FLIGHT_LOG).entries()[0]}</p>;
}
```

`app/misuse/page.tsx` is a server component that imports `useService`; the test builds the app once with it and expects the build to fail with Next's client-reference error:

```tsx
import { useService } from '@nexusdi/react';
import { FLIGHT_LOG } from '../ship.client';

export default function Misuse() {
  return <p>{useService(FLIGHT_LOG).entries()[0]}</p>;
}
```

`next.config.mjs`: `export default {};`

- [ ] **Step 4: Write the failing e2e test** `libs/react/src/react.e2e.test.ts`

```ts
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');
const fixtures = join(import.meta.dirname, '__fixtures__');

/** Packs the workspace packages into `dir` and installs the fixture against them. */
function install(fixture: string, packages: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), `nexusdi-react-${fixture}-`));
  cpSync(join(fixtures, fixture), dir, { recursive: true });
  const tarballs = packages.map((pkg) =>
    join(
      dir,
      execFileSync('npm', ['pack', '--pack-destination', dir], {
        cwd: join(root, 'libs', pkg),
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .at(-1)!,
    ),
  );
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...tarballs], {
    cwd: dir,
    stdio: 'inherit',
  });
  return dir;
}

function serve(
  command: string,
  args: string[],
  cwd: string,
  port: number,
): Promise<ChildProcess> {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, PORT: String(port) },
  });
  return new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      if (/http:\/\/|ready|started/i.test(chunk.toString())) resolve(child);
    });
    child.once('exit', (code) =>
      reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => browser?.close());

describe('React Router 8', () => {
  let dir: string;
  let server: ChildProcess;
  const port = 4801;

  beforeAll(async () => {
    dir = install('rr8', ['core', 'react', 'react-router']);
    execFileSync('npx', ['react-router', 'build'], {
      cwd: dir,
      stdio: 'inherit',
    });
    server = await serve(
      'npx',
      ['react-router-serve', 'build/server/index.js'],
      dir,
      port,
    );
  }, 300_000);
  afterAll(() => {
    server?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('renders with the request scope and hydrates with no scope or hydration error', async () => {
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on('console', (m) => messages.push(m.text()));
    page.on('pageerror', (e) => messages.push(e.message));
    const html = await (await fetch(`http://localhost:${port}/`)).text();
    expect(html).toContain('rendered on the server');
    await page.goto(`http://localhost:${port}/`);
    await page.waitForLoadState('networkidle');
    expect(await page.textContent('#log')).toBe('rendered on the server');
    expect(messages.join('\n')).not.toMatch(/NEXUS_SCOPE_REQUIRED|hydrat/i);
    await page.close();
  });
});

describe('Next 16', () => {
  let dir: string;
  let server: ChildProcess;
  const port = 4802;

  beforeAll(async () => {
    dir = install('next16', ['core', 'react']);
    rmSync(join(dir, 'app/misuse'), { recursive: true });
    execFileSync('npx', ['next', 'build'], { cwd: dir, stdio: 'inherit' });
    server = await serve(
      'npx',
      ['next', 'start', '-p', String(port)],
      dir,
      port,
    );
  }, 300_000);
  afterAll(() => {
    server?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('sends the fallback as server HTML and creates no container on the server', async () => {
    const html = await (await fetch(`http://localhost:${port}/`)).text();
    expect(html).toContain('Console skeleton');
    expect(html).not.toContain('bridge online');
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('#log');
    expect(await page.textContent('#log')).toBe('bridge online');
    expect(
      await page.evaluate(
        () =>
          (globalThis as { __nexusClientCreates?: number })
            .__nexusClientCreates,
      ),
    ).toBe(1);
    await page.close();
  });

  it('fails the build when a server component imports useService', () => {
    const misuse = install('next16', ['core', 'react']);
    try {
      expect(() =>
        execFileSync('npx', ['next', 'build'], {
          cwd: misuse,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toThrow(/client|useService/i);
    } finally {
      rmSync(misuse, { recursive: true, force: true });
    }
  }, 300_000);
});
```

The "no container on the server" assertion is the absence of the client text from the server HTML plus one create in the browser. A server-side create would render `bridge online` into the HTML, because the provider would publish a container there.

- [ ] **Step 5: Write the HMR fixture and test**

`libs/react/src/__fixtures__/hmr/src/contracts.ts`:

```ts
import { Token } from '@nexusdi/core';

export interface IFlightLog {
  label(): string;
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
```

`src/flight-log.ts`:

```ts
import type { IFlightLog } from './contracts';

export class ShuttleFlightLog implements IFlightLog {
  label() {
    return 'log v1';
  }
}
```

`src/ship.ts`:

```ts
import { Nexus, provide } from '@nexusdi/core';
import { FLIGHT_LOG } from './contracts';
import { ShuttleFlightLog } from './flight-log';

export const shipReady = Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog }),
]);
```

`src/app.tsx`:

```tsx
import { useService } from '@nexusdi/react';
import { FLIGHT_LOG } from './contracts';

export function App() {
  return <p id="log">{useService(FLIGHT_LOG).label()}</p>;
}
```

`src/main.tsx` (react spec 12.1):

```tsx
import type { Nexus } from '@nexusdi/core';
import { NexusProvider } from '@nexusdi/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { shipReady } from './ship';

const app = (ship: Nexus) => (
  <StrictMode>
    <NexusProvider container={ship} dispose>
      <App />
    </NexusProvider>
  </StrictMode>
);

const root = createRoot(document.getElementById('root')!);
root.render(app(await shipReady));

import.meta.hot?.accept('./ship', async (next) => {
  if (next) root.render(app(await next.shipReady));
});
```

`index.html`: `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`. `vite.config.ts`: `import react from '@vitejs/plugin-react'; import { defineConfig } from 'vite'; export default defineConfig({ plugins: [react()] });`

`libs/react/src/hmr.e2e.test.ts`:

```ts
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

let dir: string;
let server: ViteDevServer;
let browser: Browser;
let page: Page;
const messages: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nexusdi-react-hmr-'));
  cpSync(join(import.meta.dirname, '__fixtures__/hmr'), dir, {
    recursive: true,
  });
  server = await createServer({
    root: dir,
    configFile: join(dir, 'vite.config.ts'),
    server: { port: 4803 },
  });
  await server.listen();
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('console', (m) => messages.push(m.text()));
  page.on('pageerror', (e) => messages.push(e.message));
  await page.goto('http://localhost:4803/');
  await page.waitForSelector('#log');
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

it('swaps the container on a service edit with no NEXUS_DISPOSED', async () => {
  expect(await page.textContent('#log')).toBe('log v1');
  const file = join(dir, 'src/flight-log.ts');
  writeFileSync(file, readFileSync(file, 'utf8').replace('log v1', 'log v2'));
  await page.waitForFunction(
    () => document.querySelector('#log')?.textContent === 'log v2',
  );
  await new Promise((resolve) => setTimeout(resolve, 50)); // past the deferred release
  expect(messages.join('\n')).not.toContain('NEXUS_DISPOSED');
});

it('picks up new tokens after a contracts edit', async () => {
  const file = join(dir, 'src/contracts.ts');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n// edited\n`);
  await page.waitForTimeout(500);
  expect(await page.textContent('#log')).toBe('log v2');
  expect(messages.join('\n')).not.toMatch(
    /NEXUS_MISSING_PROVIDER|NEXUS_DISPOSED/,
  );
});
```

If the contracts test shows `NEXUS_MISSING_PROVIDER`, react spec 12.2 applies: record the result in the ledger, and Task 27's React page adds the full-reload line for contracts files. The section-module reload of react spec 12.3 is covered by the unit tests of Task 14, which drive the same code with a mocked `location.reload`.

- [ ] **Step 6: Wire the e2e target**

In `libs/react/vite.config.ts`, keep the unit config and add `src/**/*.e2e.test.ts` to `exclude` (done in Task 11). Create `libs/react/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/react:e2e',
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
```

In `libs/react/project.json` add:

```json
"e2e": {
  "executor": "nx:run-commands",
  "dependsOn": ["^build", "build"],
  "options": {
    "command": "npx vitest run --config libs/react/vitest.e2e.config.ts"
  }
}
```

Add `@playwright/test` (already a root dev dependency) and `vite` to `libs/react` `devDependencies` at the root's versions, so `@nx/dependency-checks` passes.

- [ ] **Step 7: Keep `'use client'` in the packed entry**

In `scripts/verify-packaging.mjs`, after the packed packages are unpacked into the consumer, add:

```js
// @nexusdi/react's entry must keep its directive, which some bundlers strip
// from dependencies they pre-bundle (react spec 16).
const reactEntry = readFileSync(
  join(consumer, 'node_modules/@nexusdi/react/dist/index.js'),
  'utf8',
);
if (!/^['"]use client['"];/.test(reactEntry))
  throw new Error(
    '@nexusdi/react: dist/index.js does not start with "use client"',
  );
```

Use the script's existing names for the consumer directory and `readFileSync`/`join` imports; Task 24 adds `@nexusdi/react` to `LIBS`, and this check runs from then on. Until Task 24 lands, confirm it by hand: `NX_NO_CLOUD=true NX_DAEMON=false npx nx build @nexusdi/react && head -1 libs/react/dist/index.js` prints `'use client';`.

- [ ] **Step 8: Finish the README**

In `libs/react/README.md`, add after "Quick Example":

```md
## Scopes, Sections and Server Rendering

`ScopeProvider` creates a scope for its subtree after the page hydrates, and disposes it on unmount. `SectionBoundary` loads a `lazySection` into the container once per section name and shows its fallback meanwhile. With React Router 8, the server entry passes the request scope of `@nexusdi/react-router` to `NexusProvider` as `scope`; with Next.js, a client provider sets `clientOnly`. Each of these runs only in the browser, so its subtree has no server HTML.
```

Add a second region to `libs/react/docs/examples.md` that registers `react()` and shows the error for a transient token through `ship.get` lookups in a plain function (the doctest runs in Node, without a DOM):

````md
## The transient check

<!-- #region transient -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { react } from '@nexusdi/react';

interface ISurveyDrone {
  launch(): string;
}
class ScoutDrone implements ISurveyDrone {
  launch() {
    return 'scout';
  }
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

await using ship = await Nexus.create(
  [provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' })],
  { plugins: [react()] },
);
ship.get(DRONE).launch(); // -> 'scout'
```

<!-- #endregion transient -->

`ship.get` outside render still builds a transient. `useService(DRONE)` in a component throws `NEXUS_REACT_TRANSIENT_IN_RENDER`.
````

- [ ] **Step 9: Run everything and see it pass**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/react @nexusdi/react-router && npx playwright install chromium && NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/react:e2e`
Expected: PASS. The React Router test proves the `loadContext` item of react spec 9.1; the Next test proves R12's `clientOnly` provider and R13's client-reference error.

Run the peers leg locally once: `npm install --no-save react@19.0.0 react-dom@19.0.0 && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react -- ssr && npm install`
Expected: PASS on 19.0, then the workspace is back on 19.3.0. Task 23 adds the leg (`react@19.0.0` and latest 19.x, unit and SSR suites) to `adapter-peers`.

- [ ] **Step 10: Commit**

```bash
git add libs/react scripts/verify-packaging.mjs
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(react): cover server rendering, hydration and HMR end to end

A React Router 8 fixture renders with the adapter's request scope, reads
NEXUS_SCOPE from loadContext in handleRequest, and hydrates with no
NEXUS_SCOPE_REQUIRED. A Next 16 fixture keeps the container in the browser
with clientOnly and fails the build for a server component that imports
useService. A Vite fixture swaps the container on a service edit with no
NEXUS_DISPOSED. verify-packaging keeps 'use client' first in the entry.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Next gate: the next-bridge skeleton and the double-evaluation check

This is the first Next task and a gate (spec 10.1). It answers one question before any `@nexusdi/next` code exists: does Next 16 evaluate a server module once per process when both a route handler and a server action import it?

Generator: the workspace already has `@nx/next` 23.1.1 and the `@nx/next/plugin` entry in `nx.json` (it infers `build`, `start`, `dev`), and `apps/docs` is a Next 16 app. So the skeleton uses `nx g @nx/next:application`, the workspace's official generator, and pins `next` to 16.4.1.

Files:

- Create: `examples/next-bridge/` (generator), then `examples/next-bridge/app/gate-counter.ts`, `examples/next-bridge/app/ship/gate.module.ts`, `examples/next-bridge/app/nexus.server.ts`, `examples/next-bridge/app/api/course/[to]/route.ts`, `examples/next-bridge/app/api/gate/route.ts`, `examples/next-bridge/app/actions.ts`, `examples/next-bridge/app/gate/page.tsx`, `examples/next-bridge/e2e/next-server.ts`, `examples/next-bridge/e2e/gate.e2e.ts`, `examples/next-bridge/vitest.e2e.config.ts`, `examples/next-bridge/src/request.d.ts`
- Modify: `examples/next-bridge/package.json`, `examples/next-bridge/project.json`, `commitlint.config.js` (scope `next-bridge`), `specs/2026-09-23-integrations-design.md` (section 10.1, the result), `.superpowers/sdd/integrations-0.4/progress.md` (the ledger)

Interfaces:

- Consumes: `Nexus`, `Token`, `REQUEST`, `defineModule`, `provide` from `@nexusdi/core`; `trace(fn)` from `@nexusdi/devtools`.
- Produces: `startNext(dir: string): Promise<{ url: string; close(): Promise<void> }>` in `e2e/next-server.ts` (Task 20 reuses it); `gateCounters(): { evaluations: number; creates: number }` in `app/gate-counter.ts`.

How the count works. A module-scope `let` cannot reveal a second evaluation, because each evaluation gets its own copy. So both counters live on `globalThis` under the example's own key, `Symbol.for('next-bridge.gate')`, which every module instance in the process shares:

- `evaluations`: `nexus.server.ts` increments it as its first statement, once per evaluation of that module.
- `creates`: a `trace(fn)` observer increments it on each `compile` event with `phase: 'create'`, which core emits once per `Nexus.create` (`libs/core/src/runtime/trace.ts:11`).

`nexus.server.ts` builds lazily (a memoised function), so `next build` evaluating the module does not build a container, and the counters of the `next start` process start at zero. The test hits the route handler, then the page, then posts the server action, then reads `/api/gate`. One evaluation and one create per process pass the gate.

- [ ] Step 1: Scaffold

```bash
cd /Volumes/projects/Personal/NexusDI/.claude/worktrees/integrations-0.4
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/next:application examples/next-bridge --name=@nexusdi/next-bridge --appDir=true --src=false --style=css --e2eTestRunner=none --unitTestRunner=none --linter=eslint --no-interactive
git diff nx.json
```

If `nx.json` lost comments, run `git checkout nx.json` and re-apply only the generator's functional additions (`generator-collateral` guards this). Delete the generator's sample page content, `public/` assets other than `favicon.ico`, and `specs/` if created. Set `examples/next-bridge/package.json` to:

```json
{
  "name": "@nexusdi/next-bridge",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@nexusdi/core": "*",
    "@nexusdi/devtools": "*",
    "next": "16.4.1",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "server-only": "0.0.1"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0"
  }
}
```

The folder name is `next-bridge` and the package name `@nexusdi/next-bridge`, which `project-folder-name.test.ts` requires. Run `npm install` at the root, then `NX_NO_CLOUD=true NX_DAEMON=false npx nx show project @nexusdi/next-bridge --json | jq '.targets | keys'`. Expected: `build`, `start`, `dev` among the keys (inferred by `@nx/next/plugin`).

Add `'next-bridge'` to the examples block of `commitlint.config.js` `scope-enum`, after `'meridian'`.

Write `examples/next-bridge/src/request.d.ts`:

```ts
import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
```

Add `"src/request.d.ts"` to the `include` array of `examples/next-bridge/tsconfig.json`.

- [ ] Step 2: Write the failing gate test

`examples/next-bridge/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/next-bridge:e2e',
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
```

`examples/next-bridge/e2e/next-server.ts`:

```ts
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

/** A free TCP port: next start has no port 0, so the test asks the OS for one. */
async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('no TCP address');
  server.close();
  await once(server, 'close');
  return address.port;
}

/** Runs `next start` on the build in `dir` and resolves once it answers. */
export async function startNext(
  dir: string,
): Promise<{ url: string; close(): Promise<void> }> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '-p',
      String(port),
      '-H',
      '127.0.0.1',
    ],
    { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(`next start exited ${child.exitCode}:\n${output}`);
    try {
      await fetch(`${url}/api/gate`);
      break;
    } catch {
      if (Date.now() > deadline)
        throw new Error(`next start did not answer in 60 s:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return {
    url,
    async close() {
      child.kill('SIGTERM');
      if (child.exitCode === null) await once(child, 'exit');
    },
  };
}
```

`require` is not defined in an ESM test file, so the first line of the file also needs `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`. Put both lines at the top, after the imports.

`examples/next-bridge/e2e/gate.e2e.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startNext } from './next-server';

const dir = new URL('..', import.meta.url).pathname;
let server: Awaited<ReturnType<typeof startNext>>;

beforeAll(async () => {
  server = await startNext(dir);
});
afterAll(async () => {
  await server?.close();
});

/** The action id Next renders into a progressive-enhancement form. */
function actionField(html: string): string {
  const match = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(html);
  if (match === null) throw new Error('no $ACTION_ID_ field in /gate');
  return match[1];
}

describe('the Next gate (integrations spec 10.1)', () => {
  it('evaluates nexus.server.ts once and builds one container per process', async () => {
    const route = await fetch(`${server.url}/api/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-7' },
    });
    expect(route.status).toBe(200);
    expect(await route.json()).toEqual({
      entries: ['survey-7: plotting Kepler-442b'],
    });

    const page = await fetch(`${server.url}/gate`);
    expect(page.status).toBe(200);
    const form = new FormData();
    form.set(actionField(await page.text()), '');
    form.set('entry', 'docked');
    const action = await fetch(`${server.url}/gate`, {
      method: 'POST',
      body: form,
      headers: { 'x-mission-id': 'survey-8' },
    });
    expect(action.status).toBe(200);
    expect(await action.text()).toContain('survey-8: docked');

    const counters = await (await fetch(`${server.url}/api/gate`)).json();
    expect(counters).toEqual({ evaluations: 1, creates: 1 });
  });
});
```

Add the `e2e` target to `examples/next-bridge/project.json` (create the file if the generator inferred everything):

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "@nexusdi/next-bridge",
  "targets": {
    "e2e": {
      "dependsOn": ["build", "^build"],
      "executor": "nx:run-commands",
      "options": {
        "cwd": "examples/next-bridge",
        "command": "vitest run --config vitest.e2e.config.ts"
      }
    }
  }
}
```

- [ ] Step 3: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/next-bridge:e2e`
Expected: FAIL. `/api/gate` returns 404, so `startNext` keeps polling a server that answers, then `route.status` is 404.

- [ ] Step 4: Implement the skeleton

`examples/next-bridge/app/gate-counter.ts`:

```ts
interface GateCounters {
  evaluations: number;
  creates: number;
}

const KEY = Symbol.for('next-bridge.gate');

/** One object per process: every module instance reads the same globalThis slot. */
export function gateCounters(): GateCounters {
  const slot = globalThis as { [KEY]?: GateCounters };
  slot[KEY] ??= { evaluations: 0, creates: 0 };
  return slot[KEY];
}
```

`examples/next-bridge/app/ship/gate.module.ts`:

```ts
import { defineModule, provide, REQUEST, Token } from '@nexusdi/core';

export interface Mission {
  readonly id: string;
  readonly target: string;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const MISSION = new Token<Mission>('Mission');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

/** The gate's graph: the request scope of the bridge API, nothing else. Task 20 replaces it. */
export const GateBridge = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
```

`examples/next-bridge/app/nexus.server.ts`:

```ts
import 'server-only';

import { Nexus } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { headers } from 'next/headers';

import { gateCounters } from './gate-counter';
import { GateBridge } from './ship/gate.module';

gateCounters().evaluations += 1;

let ready: Promise<Nexus> | undefined;

/** The process's container, built on first use. */
export function ship(): Promise<Nexus> {
  ready ??= Nexus.create(GateBridge, {
    plugins: [
      trace((event) => {
        if (event.type === 'compile' && event.phase === 'create')
          gateCounters().creates += 1;
      }),
    ],
  });
  return ready;
}

/** The request mapping the adapter will take: works in route handlers and actions. */
export async function missionRequest() {
  const id = (await headers()).get('x-mission-id') ?? 'survey-7';
  return { mission: { id, target: 'Kepler-442b' } };
}
```

`examples/next-bridge/app/api/course/[to]/route.ts`:

```ts
import { FLIGHT_LOG } from '../../../ship/gate.module';
import { missionRequest, ship } from '../../../nexus.server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ to: string }> },
) {
  const { to } = await params;
  await using scope = await (
    await ship()
  ).createScope({
    request: await missionRequest(),
  });
  const log = scope.get(FLIGHT_LOG);
  log.record(`plotting ${to}`);
  return Response.json({ entries: log.entries() });
}
```

`await using` in an app file: Next compiles the app with SWC, which lowers it. If `next build` rejects the syntax, write `const scope = ...; try { ... } finally { await scope[Symbol.asyncDispose](); }`, which behaves the same.

`examples/next-bridge/app/api/gate/route.ts`:

```ts
import { gateCounters } from '../../gate-counter';

export const dynamic = 'force-dynamic';

export function GET() {
  const { evaluations, creates } = gateCounters();
  return Response.json({ evaluations, creates });
}
```

`/api/gate` does not import `nexus.server.ts`, so reading the counters does not evaluate it.

`examples/next-bridge/app/actions.ts`:

```ts
'use server';

import { FLIGHT_LOG } from './ship/gate.module';
import { missionRequest, ship } from './nexus.server';

export async function recordEntry(
  _previous: string,
  form: FormData,
): Promise<string> {
  await using scope = await (
    await ship()
  ).createScope({
    request: await missionRequest(),
  });
  const log = scope.get(FLIGHT_LOG);
  log.record(String(form.get('entry') ?? ''));
  return log.entries().join('\n');
}
```

`examples/next-bridge/app/gate/page.tsx`:

```tsx
import { GateForm } from './gate-form';

export const dynamic = 'force-dynamic';

export default function GatePage() {
  return <GateForm />;
}
```

`examples/next-bridge/app/gate/gate-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';

import { recordEntry } from '../actions';

export function GateForm() {
  const [entries, action] = useActionState(recordEntry, '', '/gate');
  return (
    <form action={action}>
      <input name="entry" defaultValue="docked" />
      <button type="submit">Record</button>
      <pre>{entries}</pre>
    </form>
  );
}
```

The third argument of `useActionState` (the permalink) makes the form post to `/gate` without JavaScript, and Next renders the `$ACTION_ID_` hidden field the test reads. The no-JS post returns the re-rendered page, whose `<pre>` holds the action's result.

- [ ] Step 5: Run the gate

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/next-bridge:e2e`
Expected: PASS with `{ evaluations: 1, creates: 1 }`.

- [ ] Step 6: Apply the stop rule

If the test passes, the gate is open. Append to section 10.1 of `specs/2026-09-23-integrations-design.md`, after the paragraph that starts "The gate:":

```markdown
Gate result (Task 16 of the plan, Next 16.4.1): one evaluation of `nexus.server.ts` and
one `Nexus.create` per `next start` process after a route handler, a page and a server
action. The gate is open.
```

If `evaluations` or `creates` is 2 or more, stop the Next tasks:

1. Record the counts in section 10.1 with the sentence "The gate is closed: `@nexusdi/next` moves to 0.5." and in the ledger (`.superpowers/sdd/integrations-0.4/progress.md`) under Task 16.
2. Mark Tasks 17 and 20 "moved to 0.5" in the ledger and skip them. Keep this skeleton: Task 27's `/next/` page then teaches the hand-written pattern of `app/nexus.server.ts` and `app/api/course/[to]/route.ts`, with a `globalThis` memo for the container (the pattern `gate-counter.ts` uses), because a module-scope memo would build one container per evaluation.
3. Tell the controller, who reports it to the owner in one line. Round two of the npm bootstrap (header, owner-only step 1) does not happen.

- [ ] Step 7: Lint and commit

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint typecheck -p @nexusdi/next-bridge && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS (`commitlint-scope-enum` and `project-folder-name` include the new project).

```bash
git add examples/next-bridge commitlint.config.js package-lock.json specs/2026-09-23-integrations-design.md .superpowers/sdd/integrations-0.4/progress.md
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "test(next-bridge): check that Next evaluates the server module once

The gate of integrations spec 10.1. A route handler, a page and a server
action import one server module, and two process-wide counters show how
many times Next evaluated it and how many containers it built.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: `@nexusdi/next`: route handlers, server actions and `after()` disposal

Runs only when Task 16's gate is open.

Files:

- Create: `libs/next/` (generator), `libs/next/src/internal/request-scope.ts` (copy), `libs/next/src/nexus.ts`, `libs/next/src/index.ts`, `libs/next/src/nexus.test.ts`, `libs/next/src/nexus.test-d.ts`, `libs/next/test-support/next-stubs.ts`, `libs/next/README.md`, `libs/next/docs/examples.md`, `libs/next/project.json`
- Modify: `libs/next/package.json`, `libs/next/vite.config.ts`, `libs/next/tsconfig.lib.json`, `libs/next/tsconfig.spec.json`, `commitlint.config.js` (scope `next`), `.fallowrc.jsonc` (`publicPackages`), `tools/repo-checks/src/npm-readmes-data.ts` (`PACKAGES`, `SPECS`), `tools/repo-checks/src/owner-vocabulary.test.ts` (the `NEXUS_DISPOSED` entry)

Interfaces:

- Consumes: from `./internal/request-scope.ts` (Task 1, byte-identical copy): `ContainerSource`, `NexusLog`, `LogContext`, `NexusHttpError`, `containerOf`, `requestScope`, `statusOf`, `toHttpError`, `defaultLog`, `validator`, `DepsMap`, `ResolvedDeps`. From `next/server`: `after(callback: () => unknown): void`.
- Produces:

```ts
export interface NexusNextOptions {
  request?: () => NexusRequest | Promise<NexusRequest>;
  scopes?: { run<R>(scope: Scope, fn: () => R): R };
  log?: NexusLog;
}
export interface NexusNext {
  route<const D extends DepsMap, A extends unknown[]>(
    deps: D,
    handler: (
      deps: ResolvedDeps<D>,
      request: Request,
      ...rest: A
    ) => Response | Promise<Response>,
  ): (request: Request, ...rest: A) => Promise<Response>;
  action<const D extends DepsMap, A extends unknown[], R>(
    deps: D,
    fn: (deps: ResolvedDeps<D>, ...args: A) => R | Promise<R>,
  ): (...args: A) => Promise<Awaited<R>>;
}
export function nexus(
  ship: ContainerSource,
  options?: NexusNextOptions,
): NexusNext;
export { NexusHttpError };
export type { ContainerSource, NexusLog };
```

`request` is optional at the type level only when `NexusRequest` has no required field, as spec 3.2's `RequestOption` states. Write the options type as `RequestOption<void> & { scopes?; log? }` with `RequestOption` from spec 3.2, and `Input = void` because Next's mapping takes no argument.

- [ ] Step 1: Scaffold and wire

```bash
cd /Volumes/projects/Personal/NexusDI/.claude/worktrees/integrations-0.4
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library libs/next --name=@nexusdi/next --bundler=tsc --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
cp libs/express/src/internal/request-scope.ts libs/next/src/internal/request-scope.ts
rm -rf libs/next/src/lib
```

Align `libs/next/package.json`, `project.json`, `tsconfig.lib.json` and `tsconfig.spec.json` with `libs/node` (header, Global Constraints). In `tsconfig.lib.json` set `"types": []` (no `node`) and add `{ "path": "../core/tsconfig.lib.json" }` to `references`. `package.json` fields that differ from `libs/node`:

```json
{
  "name": "@nexusdi/next",
  "version": "0.4.0-rc.1",
  "description": "Give each Next.js route handler and server action a NexusDI request scope with typed dependencies.",
  "keywords": [
    "nexusdi",
    "dependency injection",
    "nextjs",
    "next",
    "app router",
    "server actions",
    "request scope",
    "typescript"
  ],
  "peerDependencies": {
    "@nexusdi/core": "0.4.0-rc.1",
    "next": "^15.1.0 || ^16.0.0"
  },
  "devDependencies": {
    "@nexusdi/devtools": "*",
    "@nexusdi/node": "*",
    "@nexusdi/testing": "*",
    "next": "16.4.1"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/next"
  }
}
```

No `dependencies` field: `server-only` stays in the user's `nexus.server.ts` (spec 10.1), because it throws on import outside the `react-server` condition.

Wire the workspace:

- `commitlint.config.js`: add `'next'` after `'cli'` in the Nx projects block.
- `.fallowrc.jsonc` `publicPackages`: add `"@nexusdi/next"`.
- `tools/repo-checks/src/npm-readmes-data.ts`: add `'next'` to `PACKAGES` and `next: { kind: 'sub-package', dev: false }` to `SPECS`.
- `tools/repo-checks/src/owner-vocabulary.test.ts`: add `'@nexusdi/next'` to the `packages` array of the `NEXUS_DISPOSED` entry, and change its reason to `'a request on a disposed container answers 503; every other NexusError answers 500 (integrations spec 3.6)'` (unchanged text, new member).

`libs/next/test-support/next-stubs.ts` stubs the two Next modules for unit tests and README doctests. `after` queues callbacks the test flushes; `headers` reads a header map the test sets:

```ts
import { vi } from 'vitest';

const pending: (() => unknown)[] = [];
let current = new Headers();

/** Runs every after() callback queued so far, as Next does when the response finishes. */
export async function flushAfter(): Promise<void> {
  while (pending.length > 0) await pending.shift()?.();
}
/** The headers the next headers() call returns. */
export function setHeaders(init: HeadersInit): void {
  current = new Headers(init);
}

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    pending.push(callback);
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => current,
}));
```

In `libs/next/vite.config.ts`, add `setupFiles: ['./test-support/next-stubs.ts']` under `test`. Add `"test-support/**/*.ts"` to `tsconfig.spec.json` `include` (already present in `libs/node`'s copy).

- [ ] Step 2: Write the failing tests

`libs/next/src/nexus.test.ts`:

```ts
import {
  defineModule,
  errorBase,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushAfter, setHeaders } from '../test-support/next-stubs';
import { nexus, NexusHttpError } from './index';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<{
  plot(to: string): { to: string; heading: number };
}>('NavCharts');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (r) => r.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => ({ to, heading: 42 }) },
    }),
  ],
  exports: [FLIGHT_LOG, NAV_CHARTS],
});

const request = async () => ({
  mission: { id: 'survey-7', target: 'Kepler-442b' },
});

async function shipWithEvents() {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(BridgeApi, {
    plugins: [trace((e) => events.push(e))],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((e) => e.type === type).length;
  return { ship, count };
}

afterEach(async () => {
  await flushAfter();
});

describe('route', () => {
  it('resolves the record from a request scope and disposes it after the response', async () => {
    const { ship, count } = await shipWithEvents();
    const di = nexus(ship, { request });
    const GET = di.route(
      { log: FLIGHT_LOG, charts: NAV_CHARTS },
      ({ log, charts }, _req, ctx: { to: string }) => {
        log.record(`plotting ${ctx.to}`);
        return Response.json({
          course: charts.plot(ctx.to),
          entries: log.entries(),
        });
      },
    );
    const res = await GET(new Request('http://bridge/course'), {
      to: 'Kepler-442b',
    });
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-7: plotting Kepler-442b'],
    });
    expect(count('scope:create')).toBe(1);
    expect(count('scope:dispose')).toBe(0);
    await flushAfter();
    expect(count('scope:dispose')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('reads the mission from headers() through the request option', async () => {
    const ship = await Nexus.create(BridgeApi);
    setHeaders({ 'x-mission-id': 'survey-9' });
    const { headers } = await import('next/headers');
    const di = nexus(ship, {
      request: async () => ({
        mission: {
          id: (await headers()).get('x-mission-id') ?? 'none',
          target: 'Kepler-442b',
        },
      }),
    });
    const GET = di.route({ log: FLIGHT_LOG }, ({ log }) => {
      log.record('docked');
      return Response.json(log.entries());
    });
    expect(await (await GET(new Request('http://bridge/'))).json()).toEqual([
      'survey-9: docked',
    ]);
    await flushAfter();
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 with an empty body once the container is disposed', async () => {
    const ship = await Nexus.create(BridgeApi);
    const log = vi.fn();
    const di = nexus(ship, { request, log });
    const GET = di.route(
      { log: FLIGHT_LOG },
      () => new Response('unreachable'),
    );
    await ship[Symbol.asyncDispose]();
    const res = await GET(new Request('http://bridge/'));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toMatchObject({
      adapter: '@nexusdi/next',
      status: 503,
    });
  });

  it('answers 500 with no NEXUS_ in the body for a third-party code from a construct hook', async () => {
    class ProbeError extends errorBase<'PROBE_FAILED', { probe: string }>(
      'PROBE_FAILED',
      'ProbeError',
    ) {}
    const failing: NexusPlugin = {
      name: 'probe',
      apiVersion: NEXUS_PLUGIN_API,
      construct: (instance, context) => {
        if (context.provider.token === 'FlightLog')
          throw new ProbeError({ probe: 'hull' });
        return instance;
      },
    };
    const ship = await Nexus.create(BridgeApi, { plugins: [failing] });
    const di = nexus(ship, { request, log: () => undefined });
    const GET = di.route(
      { log: FLIGHT_LOG },
      () => new Response('unreachable'),
    );
    const res = await GET(new Request('http://bridge/'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('NEXUS_');
    await flushAfter();
    await ship[Symbol.asyncDispose]();
  });

  it('leaves an error the handler throws itself to Next', async () => {
    const ship = await Nexus.create(BridgeApi);
    const di = nexus(ship, { request });
    const GET = di.route({ log: FLIGHT_LOG }, () => {
      throw new Error('sector not charted');
    });
    await expect(GET(new Request('http://bridge/'))).rejects.toThrow(
      'sector not charted',
    );
    await flushAfter();
    await ship[Symbol.asyncDispose]();
  });

  it('builds a function-form container once across concurrent first calls', async () => {
    const build = vi.fn(() => Nexus.create(BridgeApi));
    const di = nexus(build, { request });
    const GET = di.route({ log: FLIGHT_LOG }, ({ log }) =>
      Response.json(log.entries()),
    );
    await Promise.all(
      Array.from({ length: 10 }, () => GET(new Request('http://bridge/'))),
    );
    expect(build).toHaveBeenCalledTimes(1);
    await flushAfter();
    await (await build.mock.results[0].value)[Symbol.asyncDispose]();
  });

  it('runs the handler inside scopes.run when scopes is set', async () => {
    const ship = await Nexus.create(BridgeApi);
    const scopes = nodeScopes();
    const di = nexus(ship, { request, scopes });
    const GET = di.route({}, async () => {
      await Promise.resolve();
      return Response.json(scopes.current()?.get(FLIGHT_LOG).entries());
    });
    expect(await (await GET(new Request('http://bridge/'))).json()).toEqual([]);
    await flushAfter();
    await ship[Symbol.asyncDispose]();
  });
});

describe('action', () => {
  it('resolves the record, returns the result and disposes after the response', async () => {
    const { ship, count } = await shipWithEvents();
    const di = nexus(ship, { request });
    const recordEntry = di.action(
      { log: FLIGHT_LOG },
      async ({ log }, entry: string) => {
        log.record(entry);
        return log.entries();
      },
    );
    expect(await recordEntry('docked')).toEqual(['survey-7: docked']);
    expect(count('scope:dispose')).toBe(0);
    await flushAfter();
    expect(count('scope:dispose')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('throws a NexusHttpError with status 503 and no code on a disposed container', async () => {
    const ship = await Nexus.create(BridgeApi);
    await ship[Symbol.asyncDispose]();
    const di = nexus(ship, { request, log: () => undefined });
    const recordEntry = di.action(
      { log: FLIGHT_LOG },
      async () => 'unreachable',
    );
    const error = await recordEntry().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NexusHttpError);
    expect(error).toMatchObject({
      status: 503,
      message: 'Service Unavailable',
    });
    expect(Object.hasOwn(error as object, 'code')).toBe(false);
  });

  it('runs the action inside scopes.run when scopes is set', async () => {
    const ship = await Nexus.create(BridgeApi);
    const scopes = nodeScopes();
    const di = nexus(ship, { request, scopes });
    const read = di.action({}, async () =>
      scopes.current()?.get(FLIGHT_LOG).entries(),
    );
    expect(await read()).toEqual([]);
    await flushAfter();
    await ship[Symbol.asyncDispose]();
  });
});

describe('startup check', () => {
  it('fails route definition for a token with no provider when the container is live', async () => {
    const ship = await Nexus.create(BridgeApi);
    const MISSING = new Token<string>('Missing');
    const di = nexus(ship, { request, log: () => undefined });
    expect(() => di.route({ missing: MISSING }, () => new Response())).toThrow(
      /NEXUS_BLUEPRINT_INVALID/,
    );
    await ship[Symbol.asyncDispose]();
  });
});
```

The `construct` hook's context shape comes from `CompilePluginHooks`/`NexusPlugin` in `libs/core/src/runtime/plugins.ts`. If the field holding the token's description is not `context.provider.token`, read the hook's declared context type there and compare the field that names the token (the same field Task 3's construct-hook test uses for Express).

`libs/next/src/nexus.test-d.ts`:

```ts
import { Token } from '@nexusdi/core';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus } from './index';

declare const ship: import('@nexusdi/core').Nexus;
interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

describe('nexus types', () => {
  it('types the deps record and keeps the route context', () => {
    const di = nexus(ship, {
      request: async () => ({
        mission: { id: 'survey-7', target: 'Kepler-442b' },
      }),
    });
    const GET = di.route(
      { log: FLIGHT_LOG },
      ({ log }, request, ctx: { params: Promise<{ to: string }> }) => {
        expectTypeOf(log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(request).toEqualTypeOf<Request>();
        expectTypeOf(ctx.params).toEqualTypeOf<Promise<{ to: string }>>();
        return new Response();
      },
    );
    expectTypeOf(GET).parameters.toEqualTypeOf<
      [Request, { params: Promise<{ to: string }> }]
    >();
  });
  it('types the action arguments and result', () => {
    const di = nexus(ship, {
      request: async () => ({
        mission: { id: 'survey-7', target: 'Kepler-442b' },
      }),
    });
    const act = di.action({ log: FLIGHT_LOG }, async ({ log }, entry: string) =>
      log.entries().concat(entry),
    );
    expectTypeOf(act).toEqualTypeOf<(entry: string) => Promise<string[]>>();
  });
});
```

The test files augment `NexusRequest` with `mission` through `libs/next/test-support/nexus-request.d.ts`:

```ts
import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
```

- [ ] Step 3: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/next`
Expected: FAIL, cannot find `./index` exports `nexus` and `NexusHttpError`.

- [ ] Step 4: Implement `libs/next/src/nexus.ts`

```ts
import type { NexusRequest, Scope } from '@nexusdi/core';
import { after } from 'next/server';

import {
  containerOf,
  defaultLog,
  NexusHttpError,
  requestScope,
  toHttpError,
  validator,
  type ClosableRequestScope,
  type ContainerSource,
  type DepsMap,
  type NexusLog,
  type RequestOption,
  type ResolvedDeps,
  type ScopeRunner,
} from './internal/request-scope.js';

const ADAPTER = '@nexusdi/next';

// RequestOption and ScopeRunner come from the shared request-scope.ts (Task 1).
// Next's mapping takes no argument, so Input is void.
export type NexusNextOptions = RequestOption<void> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

export interface NexusNext {
  route<const D extends DepsMap, A extends unknown[]>(
    deps: D,
    handler: (
      deps: ResolvedDeps<D>,
      request: Request,
      ...rest: A
    ) => Response | Promise<Response>,
  ): (request: Request, ...rest: A) => Promise<Response>;
  action<const D extends DepsMap, A extends unknown[], R>(
    deps: D,
    fn: (deps: ResolvedDeps<D>, ...args: A) => R | Promise<R>,
  ): (...args: A) => Promise<Awaited<R>>;
}

export function nexus(
  ship: ContainerSource,
  options: NexusNextOptions = {} as NexusNextOptions,
): NexusNext {
  const container = containerOf(ship);
  const log = options.log ?? defaultLog;
  const mapRequest = (
    options as { request?: () => NexusRequest | Promise<NexusRequest> }
  ).request;

  /** Validates at definition with a live Nexus; with the function form, on the first call. */
  function checked(deps: DepsMap): () => Promise<void> {
    const check = validator(container, deps);
    if (typeof ship !== 'function') {
      try {
        ship.validate(deps);
      } catch (error) {
        log(error, { adapter: ADAPTER, phase: 'validate' });
        throw error;
      }
    }
    return check;
  }

  /** One scope per call, closed by after() once Next has finished the response. */
  function open(): ClosableRequestScope {
    const handle = requestScope(container, () => mapRequest?.());
    after(() =>
      handle
        .close()
        .catch((error: unknown) =>
          log(error, { adapter: ADAPTER, phase: 'dispose' }),
        ),
    );
    return handle;
  }

  async function withScope<D extends DepsMap, T>(
    handle: ClosableRequestScope,
    deps: D,
    check: () => Promise<void>,
    call: (resolved: ResolvedDeps<D>) => T | Promise<T>,
  ): Promise<T> {
    let scope: Scope;
    let resolved: ResolvedDeps<D>;
    try {
      await check();
      scope = await handle.scope();
      resolved = scope.resolve(deps);
    } catch (error) {
      throw toHttpError(error, log, ADAPTER, 'scope');
    }
    const run = async () => call(resolved);
    return options.scopes ? options.scopes.run(scope, run) : run();
  }

  return {
    route(deps, handler) {
      const check = checked(deps);
      return async (request, ...rest) => {
        const handle = open();
        try {
          return await withScope(handle, deps, check, (resolved) =>
            handler(resolved, request, ...rest),
          );
        } catch (error) {
          if (!(error instanceof NexusHttpError)) throw error;
          // Next turns any thrown error into a 500, which would lose the 503 (spec 10.5).
          return new Response(null, {
            status: error.status,
            statusText: error.message,
          });
        }
      };
    },
    action(deps, fn) {
      const check = checked(deps);
      return async (...args) => {
        const handle = open();
        return (await withScope(handle, deps, check, (resolved) =>
          fn(resolved, ...args),
        )) as Awaited<ReturnType<typeof fn>>;
      };
    },
  };
}
```

`toHttpError` (Task 1) logs once and returns a `NexusHttpError` for a mapped error and rethrows anything else unchanged, so a handler's own error never reaches the `catch` as a `NexusHttpError`: the handler runs outside the `try` of `withScope`. `validator` caches the result per container, so a live container is not validated twice; the definition-time `ship.validate(deps)` is what makes a wrong token fail when the route module loads.

`libs/next/src/index.ts`:

```ts
export { nexus, type NexusNext, type NexusNextOptions } from './nexus.js';
export {
  NexusHttpError,
  type ContainerSource,
  type LogContext,
  type NexusLog,
} from './internal/request-scope.js';
```

- [ ] Step 5: Run the tests

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test lint typecheck build -p @nexusdi/next`
Expected: PASS.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS. `owner-vocabulary` sees `@nexusdi/next` use its entry; `adapter-shared-copies` (Task 5) finds the new copy identical; `core-layers` finds no `node:` import.

- [ ] Step 6: Write the README and examples

`libs/next/README.md` follows the npm README standard (`tools/repo-checks/src/npm-readmes.ts`, sub-package kind, at most 90 lines, one doctest with a `// ->` claim):

````markdown
# @nexusdi/next

[![npm](https://img.shields.io/npm/v/@nexusdi/next/next)](https://www.npmjs.com/package/@nexusdi/next)
[![license](https://img.shields.io/npm/l/@nexusdi/next)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give each Next.js route handler and server action a NexusDI request scope with typed dependencies.**

A route handler that creates a scope by hand has to dispose it when the response is done, and a streamed response is done long after the handler returns. A server action needs the same scope, built from the same request headers.

`@nexusdi/next` wraps a route handler or a server action in a request scope from your [NexusDI](https://www.npmjs.com/package/@nexusdi/core) container. It resolves the dependencies you name, and disposes the scope through Next's `after()` once the response has finished.

## How it works

`di.route(deps, handler)` and `di.action(deps, fn)` resolve the record from a scope created for that call. The `request` option maps `headers()` and `cookies()` to your `NexusRequest`. A container that is shutting down answers 503, and any other NexusError 500, with nothing from NexusDI in the response.

## Example

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/next';

interface IFlightLog {
  record(entry: string): string;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class ShuttleFlightLog implements IFlightLog {
  record(entry: string) {
    return `survey-7: ${entry}`;
  }
}

await using ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

const recordEntry = di.action({ log: FLIGHT_LOG }, ({ log }, entry: string) =>
  log.record(entry),
);
const line = await recordEntry('docked'); // -> 'survey-7: docked'
console.log(line);
```

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/next@next @nexusdi/core@next
```

Requires Next.js 15.1 or later on the Node runtime, and Node 22.12 or later.

## Documentation

- [Scope a Next.js route handler or server action](https://nexus.js.org/next/next/)
- [API reference](https://nexus.js.org/next/api-next/)

## License

MIT
````

The doctest runs under `libs/next`'s Vitest with `test-support/next-stubs.ts`, so `after` queues the disposal and no Next server is needed. If `npm-readmes.test.ts` asks for headings or links the template above lacks (it reads `HEADINGS`, `LIMITS` and `DOCS_CONTENT` from `npm-readmes-data.ts`), copy the shape of `libs/node/README.md` exactly and keep the example.

`libs/next/docs/examples.md` holds one region, `route`, with the route handler of spec 10.3 written against the test module above, run as a doctest:

````markdown
# Next examples

## A route handler with typed dependencies

<!-- #region route -->

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/next';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

await using ship = await Nexus.create([
  provide(NAV_CHARTS, {
    useValue: { plot: (to: string) => ({ to, heading: 42 }) },
  }),
]);
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

const GET = di.route(
  { charts: NAV_CHARTS },
  async (
    { charts },
    _request,
    { params }: { params: Promise<{ to: string }> },
  ) => Response.json(charts.plot((await params).to)),
);
const res = await GET(new Request('http://bridge/course/Kepler-442b'), {
  params: Promise.resolve({ to: 'Kepler-442b' }),
});
const course = await res.json(); // -> { to: 'Kepler-442b', heading: 42 }
console.log(course);
```

<!-- #endregion route -->
````

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/next && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS (the doctests and `npm-readmes`).

- [ ] Step 7: Commit

```bash
git add libs/next commitlint.config.js .fallowrc.jsonc tools/repo-checks/src/npm-readmes-data.ts tools/repo-checks/src/owner-vocabulary.test.ts package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(next): add route and action wrappers with a request scope

di.route and di.action resolve a deps record from a scope created for the
call and dispose it through after(). A route handler answers a mapped
error with a Response, so a 503 survives Next's own error handling, and
an action throws a NexusHttpError with no code.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: `examples/bridge-api`: the Meridian server demo

The "Meridian app (Hono, backend)" of the demo apps plan (spec D6, section 14). One module graph serves four entries. Tasks 19 and 20 import its ship modules, and Task 21 runs its Worker entry.

Files:

- Create: `examples/bridge-api/` (generator), and under it:
  - `src/ship/contracts.ts`, `src/ship/star-charts.ts`, `src/ship/charts.json`, `src/ship/comms.module.ts`, `src/ship/tactical.module.ts`, `src/ship/bridge-api.module.ts`, `src/ship/meridian.ts`, `src/ship/audit.ts`, `src/ship/plugins.ts`, `src/ship/index.ts`, `src/request.d.ts`, `src/worker-env.d.ts`
  - `src/hono.ts`, `src/express.ts`, `src/fastify.ts`, `src/worker.ts`, `src/bridge/uncharted.ts`, `src/server.hono.ts`, `src/server.express.ts`, `src/server.fastify.ts`
  - `test/doubles.ts`, `test/fixtures.ts`, `test/routes.test.ts`, `test/check.test.ts`, `e2e/relay.ts`, `e2e/servers.ts`, `e2e/bridge.e2e.ts`, `bench/bridge.bench.ts`, `bench/cold.mjs`, `vitest.e2e.config.ts`, `graph.json`
- Modify: `examples/bridge-api/package.json`, `examples/bridge-api/project.json`, `commitlint.config.js` (scope `bridge-api`)

Interfaces:

- Consumes: `nexus` from `@nexusdi/hono` (Task 7), `@nexusdi/express` (Task 2) and `@nexusdi/fastify` (Task 5), each with `ContainerSource`; `nexusFixtures` from `@nexusdi/vitest` (Task 4); `errors()`, `devtools()`, `trace(fn)`, `interceptors()`, `interceptor()`, `nodeScopes()`.
- Produces (exported through `package.json` `exports` `./ship` and `./contracts`, used by Tasks 19 and 20):

```ts
// @nexusdi/bridge-api/contracts
export interface Mission {
  readonly id: string;
  readonly target: string;
}
export interface Course {
  readonly to: string;
  readonly heading: number;
}
export interface INavCharts {
  plot(to: string): Course;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export interface ISubspaceLink {
  receive<T>(channel: string): Promise<T>;
}
export interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay';
  readonly relayUrl: string;
}
export const NAV_CHARTS: Token<INavCharts>;
export const FLIGHT_LOG: Token<IFlightLog>;
export const MISSION: Token<Mission>;
export const SUBSPACE_LINK: Token<ISubspaceLink>;
export const COMMS_OPTIONS: Token<CommsOptions>;

// @nexusdi/bridge-api/ship
export const BridgeApi: ModuleDefinition; // MISSION (scoped, eager: false) and FLIGHT_LOG (scoped)
export function tactical(relayUrl: string): ModuleDefinition; // NAV_CHARTS via StarCharts.download(link)
export const OfflineTactical: ModuleDefinition; // NAV_CHARTS over the bundled charts.json
export function meridian(relayUrl: string): ModuleDefinition;
export const Meridian: ModuleDefinition; // meridian(DEFAULT_RELAY_URL), for the graph CLI
export const OfflineMeridian: ModuleDefinition;
export const DEFAULT_RELAY_URL: string; // 'https://relay.meridian.invalid'
export function bridgePlugins(options?: {
  dev?: boolean;
  trace?: (event: TraceEvent) => void;
}): NexusPlugin[];
export const NAV_AUDIT: Token<INavAudit>; // the interceptor of the demo apps plan row
export interface INavAudit extends Interceptor {
  readonly calls: readonly string[];
}

// src/hono.ts, src/express.ts, src/fastify.ts
export interface BridgeOptions {
  scopes?: {
    run<R>(scope: Scope, fn: () => R): R;
    current?(): Scope | undefined;
  };
  log?: NexusLog;
}
export function createBridge(
  ship: ContainerSource,
  options?: BridgeOptions,
): Hono | Express | Promise<FastifyInstance>;
```

Two departures from spec 3.8, both recorded in the commit message: `MISSION` lives in `BridgeApi` (spec 3.8 imports `Tactical` "for MISSION"), so `BridgeApi` needs no `Tactical` instance; and `Tactical` is a function of the relay URL, `tactical(relayUrl)`, because a Worker reads the URL from its bindings. `NAV_AUDIT` and `INavAudit` are new names: the demo apps plan wants an interceptor on handlers, and docs spec §7.1 has none, so the commit adds them to the ledger for the docs vocabulary.

- [ ] Step 1: Scaffold

```bash
cd /Volumes/projects/Personal/NexusDI/.claude/worktrees/integrations-0.4
NX_NO_CLOUD=true NX_DAEMON=false npx nx g @nx/js:library examples/bridge-api --name=@nexusdi/bridge-api --bundler=none --unitTestRunner=vitest --linter=eslint --no-interactive
git diff nx.json
rm -rf examples/bridge-api/src/lib
```

`examples/bridge-api/package.json`:

```json
{
  "name": "@nexusdi/bridge-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./contracts": "./src/ship/contracts.ts",
    "./ship": "./src/ship/index.ts",
    "./hono": "./src/hono.ts"
  },
  "dependencies": {
    "@hono/node-server": "2.1.5",
    "@nexusdi/core": "*",
    "@nexusdi/devtools": "*",
    "@nexusdi/errors": "*",
    "@nexusdi/express": "*",
    "@nexusdi/fastify": "*",
    "@nexusdi/hono": "*",
    "@nexusdi/interceptors": "*",
    "@nexusdi/node": "*",
    "express": "5.3.0",
    "fastify": "5.12.7",
    "hono": "4.13.13"
  },
  "devDependencies": {
    "@nexusdi/cli": "*",
    "@nexusdi/testing": "*",
    "@nexusdi/vitest": "*",
    "@types/express": "5.0.6",
    "esbuild": "0.28.2"
  }
}
```

Add `'bridge-api'` to `commitlint.config.js` `scope-enum`, after `'meridian'`. Run `npm install`.

`examples/bridge-api/src/request.d.ts`:

```ts
import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
```

`examples/bridge-api/src/worker-env.d.ts`, the binding type until Task 21 generates the Workers types:

```ts
declare module 'cloudflare:workers' {
  export const env: { readonly RELAY_URL: string };
}
```

- [ ] Step 2: Write the failing route and check tests

`examples/bridge-api/test/doubles.ts` (spec 3.8):

```ts
import type { IFlightLog, INavCharts } from '../src/ship/contracts';

export const fakeCharts: INavCharts = {
  plot: (to) => ({ to, heading: 42 }),
};

export class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
```

`examples/bridge-api/test/fixtures.ts`:

```ts
import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';

import { FLIGHT_LOG, NAV_CHARTS } from '../src/ship/contracts';
import { Meridian } from '../src/ship/meridian';
import { fakeCharts, MemoryFlightLog } from './doubles';

export const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) =>
      builder
        .override(NAV_CHARTS, { useValue: fakeCharts })
        .override(FLIGHT_LOG, { useClass: MemoryFlightLog }),
  }),
);
```

`examples/bridge-api/test/routes.test.ts`, the three route tests of spec 4.7, 5.1 and 6.1 over one fixture file:

```ts
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { expect } from 'vitest';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { createBridge as honoBridge } from '../src/hono';
import { test } from './fixtures';

const course = { to: 'Kepler-442b', heading: 42 };

test('Hono plots the course with the fake charts', async ({ nexus }) => {
  const res = await honoBridge(nexus).request('/course/Kepler-442b');
  expect(await res.json()).toEqual({
    course,
    entries: ['plotting Kepler-442b'],
  });
});

test('Express plots the course with the fake charts', async ({ nexus }) => {
  const server = expressBridge(nexus).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
    expect(await res.json()).toEqual({
      course,
      entries: ['plotting Kepler-442b'],
    });
  } finally {
    server.close();
  }
});

test('Fastify plots the course with the fake charts', async ({ nexus }) => {
  const bridge = await fastifyBridge(nexus);
  const res = await bridge.inject({ url: '/course/Kepler-442b' });
  expect(res.json()).toEqual({ course, entries: ['plotting Kepler-442b'] });
  await bridge.close();
});

test.override({
  nexusRequest: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});

test('the audit interceptor sees every plot', async ({ nexus }) => {
  const { NAV_AUDIT } = await import('../src/ship/audit');
  const res = await honoBridge(nexus).request('/course/Kepler-442b');
  expect(res.status).toBe(200);
  expect(nexus.get(NAV_AUDIT).calls).toEqual(['plot Kepler-442b']);
});
```

The last test needs `bridgePlugins()` in the fixture's container. Pass it through the fixture options: in `test/fixtures.ts` add `create: { plugins: bridgePlugins() }` to the `nexusFixtures` options, importing `bridgePlugins` from `../src/ship/plugins`. `MemoryFlightLog` records without the mission prefix, which is why the expected entries read `plotting Kepler-442b`.

`examples/bridge-api/test/check.test.ts`:

```ts
import {
  defineModule,
  isNexusError,
  Nexus,
  provide,
  Token,
} from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { MISSION } from '../src/ship/contracts';
import { bridgePlugins } from '../src/ship/plugins';
import { Meridian, OfflineMeridian } from '../src/ship/meridian';

describe('the bridge API graph', () => {
  it('compiles with no user code (the startup check of spec 9.2)', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
    expect(() =>
      Nexus.check(OfflineMeridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
  });

  it('fails the check when a provider has no MISSION to read', () => {
    const TRACKER = new Token<{ id: string }>('Tracker');
    const Broken = defineModule({
      name: 'Broken',
      providers: [
        provide(TRACKER, {
          useFactory: (m) => m,
          deps: [MISSION],
          lifetime: 'scoped',
        }),
      ],
    });
    let thrown: unknown;
    try {
      Nexus.check(Broken);
    } catch (error) {
      thrown = error;
    }
    expect(isNexusError(thrown, 'NEXUS_BLUEPRINT_INVALID')).toBe(true);
  });
});
```

- [ ] Step 3: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api`
Expected: FAIL, cannot find `../src/ship/contracts`.

- [ ] Step 4: Implement the ship

`src/ship/contracts.ts`:

```ts
import { Token } from '@nexusdi/core';

export interface Mission {
  readonly id: string;
  readonly target: string;
}
export interface Course {
  readonly to: string;
  readonly heading: number;
}
export interface INavCharts {
  plot(to: string): Course;
}
export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export interface ISubspaceLink {
  receive<T>(channel: string): Promise<T>;
}
export interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay';
  readonly relayUrl: string;
}

export const NAV_CHARTS = new Token<INavCharts>('NavCharts');
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
export const MISSION = new Token<Mission>('Mission');
export const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
export const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
```

`src/ship/charts.json`:

```json
{ "Kepler-442b": 42, "Proxima-b": 117, "TRAPPIST-1e": 203 }
```

`src/ship/star-charts.ts`:

```ts
import type { Course, INavCharts, ISubspaceLink } from './contracts';

export class StarCharts implements INavCharts {
  /** Downloads the chart table over the subspace link. Does I/O, so a Worker builds it on the first request (spec 9.2). */
  static async download(link: ISubspaceLink): Promise<StarCharts> {
    return new StarCharts(await link.receive<Record<string, number>>('charts'));
  }
  constructor(private readonly headings: Readonly<Record<string, number>>) {}
  plot(to: string): Course {
    return { to, heading: this.headings[to] ?? 0 };
  }
}
```

`src/ship/comms.module.ts`:

```ts
import { defineModule, provide } from '@nexusdi/core';

import {
  COMMS_OPTIONS,
  SUBSPACE_LINK,
  type CommsOptions,
  type ISubspaceLink,
} from './contracts';

class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  constructor(private readonly options: CommsOptions) {}
  async receive<T>(channel: string): Promise<T> {
    const url = new URL(
      channel,
      this.options.relayUrl.endsWith('/')
        ? this.options.relayUrl
        : `${this.options.relayUrl}/`,
    );
    url.searchParams.set('frequency', String(this.options.frequency));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`relay answered ${res.status} for ${channel}`);
    return (await res.json()) as T;
  }
}

export const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});
```

`src/ship/tactical.module.ts`:

```ts
import { defineModule, provide } from '@nexusdi/core';

import charts from './charts.json' with { type: 'json' };
import { Comms } from './comms.module';
import { NAV_CHARTS, SUBSPACE_LINK } from './contracts';
import { StarCharts } from './star-charts';

/** NAV_CHARTS downloaded over the relay at relayUrl: an async factory that does I/O. */
export function tactical(relayUrl: string) {
  return defineModule({
    name: 'Tactical',
    imports: [Comms.forRoot({ frequency: 1420, transport: 'relay', relayUrl })],
    providers: [
      provide(NAV_CHARTS, {
        useFactory: async (link) => StarCharts.download(link),
        deps: [SUBSPACE_LINK],
      }),
    ],
    exports: [NAV_CHARTS],
  });
}

/** NAV_CHARTS over the bundled table: no I/O, so a Worker can build it at module scope. */
export const OfflineTactical = defineModule({
  name: 'OfflineTactical',
  providers: [provide(NAV_CHARTS, { useValue: new StarCharts(charts) })],
  exports: [NAV_CHARTS],
});
```

`src/ship/bridge-api.module.ts`:

```ts
import { defineModule, provide, REQUEST } from '@nexusdi/core';

import {
  FLIGHT_LOG,
  MISSION,
  type IFlightLog,
  type Mission,
} from './contracts';

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

export const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    // Sync and scoped: eager: false, so a request that never reads it never runs it (spec 9.2).
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [MISSION, FLIGHT_LOG],
});
```

`src/ship/meridian.ts`:

```ts
import { defineModule } from '@nexusdi/core';

import { BridgeApi } from './bridge-api.module';
import { OfflineTactical, tactical } from './tactical.module';

export const DEFAULT_RELAY_URL = 'https://relay.meridian.invalid';

export function meridian(relayUrl: string) {
  return defineModule({
    name: 'Meridian',
    imports: [tactical(relayUrl), BridgeApi],
  });
}

/** The graph the CLI draws and the check test compiles. */
export const Meridian = meridian(DEFAULT_RELAY_URL);
export const OfflineMeridian = defineModule({
  name: 'OfflineMeridian',
  imports: [OfflineTactical, BridgeApi],
});
```

`src/ship/audit.ts`:

```ts
import { Token } from '@nexusdi/core';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

export interface INavAudit extends Interceptor {
  readonly calls: readonly string[];
}
export const NAV_AUDIT = new Token<INavAudit>('NavAudit');

export class NavAudit implements INavAudit {
  readonly #calls: string[] = [];
  get calls() {
    return this.#calls;
  }
  intercept(call: CallContext, next: Next) {
    this.#calls.push(
      `${String(call.method)} ${call.args.map(String).join(' ')}`,
    );
    return next();
  }
}
```

`src/ship/plugins.ts`:

```ts
import type { NexusPlugin, TraceEvent } from '@nexusdi/core';
import { devtools, trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';

import { NAV_CHARTS } from './contracts';
import { NAV_AUDIT, NavAudit } from './audit';

/** The demo app's plugins: the audit interceptor always; errors() and devtools() in development. */
export function bridgePlugins(
  options: { dev?: boolean; trace?: (event: TraceEvent) => void } = {},
): NexusPlugin[] {
  return [
    interceptors({
      register: [interceptor(NAV_AUDIT, { useClass: NavAudit })],
      bindings: [{ token: NAV_CHARTS, class: [NAV_AUDIT] }],
    }),
    ...(options.dev ? [errors(), devtools()] : []),
    ...(options.trace ? [trace(options.trace)] : []),
  ];
}
```

`src/ship/index.ts`:

```ts
export { BridgeApi } from './bridge-api.module';
export { Comms } from './comms.module';
export {
  DEFAULT_RELAY_URL,
  Meridian,
  meridian,
  OfflineMeridian,
} from './meridian';
export { OfflineTactical, tactical } from './tactical.module';
export { NAV_AUDIT, type INavAudit } from './audit';
export { bridgePlugins } from './plugins';
export * from './contracts';
```

- [ ] Step 5: Implement the three framework entries

Every entry serves the same five routes, which Tasks 21 and 22 also run on the edge legs:

| Route                         | Scope  | Answer                                                                                                                                                                            |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                 | none   | `ok`; registered before the middleware, so no scope handle exists                                                                                                                 |
| `GET /course/:to`             | inject | `{ course, entries }`; with `x-mission-id: missing-provider` the handler resolves the unbound `UNCHARTED` token through `di.scope` and the request answers 500 with an empty body |
| `GET /mission`                | inject | `{ id }` read from `scopes.current()` inside a service call; `{ id: null }` when `scopes` is unset                                                                                |
| `GET /log/stream`             | inject | three flight log entries, one every 50 ms, written after the handler returned (Hono `streamSSE`, Express `res.write`, Fastify `reply.send(stream)`)                               |
| any route, container disposed | n/a    | 503, empty body                                                                                                                                                                   |

`src/bridge/uncharted.ts`, the token no module provides:

```ts
import { Token } from '@nexusdi/core';

/** Bound nowhere: the missing-provider case of the e2e suite resolves it and answers 500. */
export const UNCHARTED = new Token<{ plot(): void }>('Uncharted');
```

`src/hono.ts`:

```ts
import { nexus, type ContainerSource, type NexusLog } from '@nexusdi/hono';
import type { Scope } from '@nexusdi/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';

import { UNCHARTED } from './bridge/uncharted';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from './ship/contracts';

export interface BridgeOptions {
  scopes?: {
    run<R>(scope: Scope, fn: () => R): R;
    current?(): Scope | undefined;
  };
  log?: NexusLog;
}

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (c) => ({
      mission: {
        id: c.req.header('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
    scopes: options.scopes,
    log: options.log,
  });

  return new Hono()
    .get('/health', (c) => c.text('ok'))
    .use(di.middleware)
    .get(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        async ({ charts, log }, c) => {
          if (c.req.header('x-mission-id') === 'missing-provider') {
            (await di.scope(c)).get(UNCHARTED);
          }
          const to = c.req.param('to');
          log.record(`plotting ${to}`);
          return c.json({ course: charts.plot(to), entries: log.entries() });
        },
      ),
    )
    .get(
      '/mission',
      di.inject({}, async (_deps, c) => {
        await Promise.resolve(); // read across an await, as a service call would
        return c.json({
          id: options.scopes?.current?.()?.get(MISSION).id ?? null,
        });
      }),
    )
    .get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
        streamSSE(c, async (stream) => {
          for (let tick = 1; tick <= 3; tick += 1) {
            await stream.sleep(50);
            log.record(`tick ${tick}`);
            await stream.writeSSE({ data: log.entries().at(-1) ?? '' });
          }
        }),
      ),
    )
    .onError((error, c) =>
      error instanceof HTTPException ? error.getResponse() : c.body(null, 500),
    );
}
```

`/health` sits before `di.middleware`, so it never has a scope handle; the e2e test counts no `scope:create` for it. The `onError` handler keeps the adapter's `HTTPException` (500 or 503 with the status text, spec 4.3) and sends an empty 500 for the handler's own errors, such as the missing-provider case, which raises in the handler outside the adapter's mapping. `NodeScopes` from `@nexusdi/node` satisfies `BridgeOptions['scopes']`, and the file imports nothing from `@nexusdi/node`, which keeps it out of the Worker bundle.

`src/express.ts`:

```ts
import { nexus, type ContainerSource } from '@nexusdi/express';
import express, { type ErrorRequestHandler } from 'express';

import { UNCHARTED } from './bridge/uncharted';
import type { BridgeOptions } from './hono';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from './ship/contracts';

export function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (req) => ({
      mission: {
        id: req.get('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
    scopes: options.scopes,
    log: options.log,
  });

  const bridge = express();
  bridge.get('/health', (_req, res) => {
    res.send('ok');
  });
  bridge.use(di.middleware);
  bridge.get(
    '/course/:to',
    di.inject(
      { charts: NAV_CHARTS, log: FLIGHT_LOG },
      async ({ charts, log }, req, res) => {
        if (req.get('x-mission-id') === 'missing-provider')
          (await di.scope(req)).get(UNCHARTED);
        log.record(`plotting ${req.params.to}`);
        res.json({
          course: charts.plot(req.params.to),
          entries: log.entries(),
        });
      },
    ),
  );
  bridge.get(
    '/mission',
    di.inject({}, async (_deps, _req, res) => {
      await Promise.resolve();
      res.json({ id: options.scopes?.current?.()?.get(MISSION).id ?? null });
    }),
  );
  bridge.get(
    '/log/stream',
    di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, res) => {
      res.setHeader('content-type', 'text/event-stream');
      for (let tick = 1; tick <= 3; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        log.record(`tick ${tick}`);
        res.write(`data: ${log.entries().at(-1)}\n\n`);
      }
      res.end();
    }),
  );
  const empty: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status((error as { status?: number }).status ?? 500).end();
  };
  bridge.use(empty);
  return bridge;
}
```

The error handler ends every error with its status and an empty body, so Express's development handler never sends a stack that holds a core message. `NexusHttpError` carries `status`, so a 503 stays a 503.

`src/fastify.ts`:

```ts
import { Readable } from 'node:stream';

import { nexus, type ContainerSource } from '@nexusdi/fastify';
import Fastify from 'fastify';

import { UNCHARTED } from './bridge/uncharted';
import type { BridgeOptions } from './hono';
import { FLIGHT_LOG, MISSION, NAV_CHARTS } from './ship/contracts';

export async function createBridge(
  ship: ContainerSource,
  options: BridgeOptions = {},
) {
  const di = nexus(ship, {
    request: (req) => ({
      mission: {
        id: String(req.headers['x-mission-id'] ?? 'survey-7'),
        target: 'Kepler-442b',
      },
    }),
    scopes: options.scopes,
    log: options.log,
  });

  const bridge = Fastify();
  bridge.setErrorHandler((error, _req, reply) => {
    void reply
      .code((error as { statusCode?: number }).statusCode ?? 500)
      .send();
  });
  bridge.get('/health', async () => 'ok');
  await bridge.register(async (scoped) => {
    await scoped.register(di.encapsulatedPlugin);
    scoped.get<{ Params: { to: string } }>(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        async ({ charts, log }, req) => {
          if (req.headers['x-mission-id'] === 'missing-provider')
            (await di.scope(req)).get(UNCHARTED);
          log.record(`plotting ${req.params.to}`);
          return { course: charts.plot(req.params.to), entries: log.entries() };
        },
      ),
    );
    scoped.get(
      '/mission',
      di.inject({}, async () => {
        await Promise.resolve();
        return { id: options.scopes?.current?.()?.get(MISSION).id ?? null };
      }),
    );
    scoped.get(
      '/log/stream',
      di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, reply) => {
        async function* ticks() {
          for (let tick = 1; tick <= 3; tick += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            log.record(`tick ${tick}`);
            yield `data: ${log.entries().at(-1)}\n\n`;
          }
        }
        return reply.type('text/event-stream').send(Readable.from(ticks()));
      }),
    );
  });
  return bridge;
}
```

Fastify's `/health` sits outside the encapsulated context that registers `di.encapsulatedPlugin` (spec 6.1), so it gets no scope handle, which matches the Hono and Express apps. The `node:stream` import is fine here: `examples/` is outside `nodeViolations`, and only the Node entries import this file.

Server entries, each with `no-run` behaviour in tests (only the e2e suite starts servers, through `e2e/servers.ts`):

`src/server.hono.ts`:

```ts
import { serve } from '@hono/node-server';
import { Nexus } from '@nexusdi/core';
import { once } from 'node:events';

import { createBridge } from './hono';
import { bridgePlugins } from './ship/plugins';
import { meridian, OfflineMeridian } from './ship/meridian';

const dev = process.env.NODE_ENV !== 'production';
const root = process.env.RELAY_URL
  ? meridian(process.env.RELAY_URL)
  : OfflineMeridian;

await using ship = await Nexus.create(root, {
  plugins: bridgePlugins({ dev }),
});
const server = serve({
  fetch: createBridge(ship).fetch,
  port: Number(process.env.PORT ?? 3000),
});
process.once('SIGTERM', () => server.close());
await once(server, 'close');
```

`src/server.express.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { once } from 'node:events';

import { createBridge } from './express';
import { bridgePlugins } from './ship/plugins';
import { meridian, OfflineMeridian } from './ship/meridian';

const dev = process.env.NODE_ENV !== 'production';
const root = process.env.RELAY_URL
  ? meridian(process.env.RELAY_URL)
  : OfflineMeridian;

await using ship = await Nexus.create(root, {
  plugins: bridgePlugins({ dev }),
});
const server = createBridge(ship).listen(Number(process.env.PORT ?? 3000));
process.once('SIGTERM', () => server.close());
await once(server, 'close');
```

`src/server.fastify.ts`:

```ts
import { Nexus } from '@nexusdi/core';

import { createBridge } from './fastify';
import { bridgePlugins } from './ship/plugins';
import { meridian, OfflineMeridian } from './ship/meridian';

const dev = process.env.NODE_ENV !== 'production';
const root = process.env.RELAY_URL
  ? meridian(process.env.RELAY_URL)
  : OfflineMeridian;

const ship = await Nexus.create(root, { plugins: bridgePlugins({ dev }) });
const bridge = await createBridge(ship);
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: Number(process.env.PORT ?? 3000) });
process.once('SIGTERM', () => bridge.close());
```

`src/worker.ts` (spec 9.2; Task 21 runs it on workerd):

```ts
import { Nexus } from '@nexusdi/core';
import { env } from 'cloudflare:workers';

import { createBridge } from './hono';
import { bridgePlugins } from './ship/plugins';
import { meridian, OfflineMeridian } from './ship/meridian';

// NAV_CHARTS downloads over the relay, and Workers refuses I/O at module scope,
// so the relay graph uses the function form: one build per isolate, on the
// first request. The offline graph does no I/O and could build at module scope;
// Task 21's module-scope entry shows that form.
export default createBridge(() =>
  Nexus.create(env.RELAY_URL ? meridian(env.RELAY_URL) : OfflineMeridian, {
    plugins: bridgePlugins(),
  }),
);
```

`src/worker.ts` imports no `node:` module and no `@nexusdi/node` value, so wrangler bundles it without `nodejs_compat` (the ambient leg of Task 21 adds `node:async_hooks` through its own entry).

- [ ] Step 6: Run the route and check tests

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api`
Expected: PASS (4 route tests, 2 check tests).

- [ ] Step 7: Write the failing e2e suite

`examples/bridge-api/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/bridge-api:e2e',
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
```

`examples/bridge-api/e2e/relay.ts`, a local subspace relay so the I/O factory runs with no network:

```ts
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import charts from '../src/ship/charts.json' with { type: 'json' };

/** Serves GET /charts with the bundled table and counts the downloads. */
export async function startRelay(): Promise<{
  url: string;
  downloads(): number;
  close(): Promise<void>;
}> {
  let downloads = 0;
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/charts')) {
      downloads += 1;
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(charts));
      return;
    }
    res.writeHead(404).end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    downloads: () => downloads,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}
```

`examples/bridge-api/e2e/servers.ts`:

```ts
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { serve } from '@hono/node-server';
import type { ContainerSource } from '@nexusdi/core';
import type { NodeScopes } from '@nexusdi/node';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { createBridge as honoBridge } from '../src/hono';

export interface RunningBridge {
  readonly url: string;
  close(): Promise<void>;
}
export type StartBridge = (
  ship: ContainerSource,
  scopes?: NodeScopes,
) => Promise<RunningBridge>;

function urlOf(address: AddressInfo | string | null): string {
  if (address === null || typeof address === 'string')
    throw new Error('no TCP address');
  return `http://127.0.0.1:${address.port}`;
}

export const servers: Readonly<
  Record<'hono' | 'express' | 'fastify', StartBridge>
> = {
  async hono(ship, scopes) {
    const server = serve({
      fetch: honoBridge(ship, { scopes }).fetch,
      port: 0,
      hostname: '127.0.0.1',
    });
    await once(server, 'listening');
    return {
      url: urlOf(server.address()),
      close: async () => {
        server.close();
        await once(server, 'close');
      },
    };
  },
  async express(ship, scopes) {
    const server = expressBridge(ship, { scopes }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
      url: urlOf(server.address()),
      close: async () => {
        server.close();
        await once(server, 'close');
      },
    };
  },
  async fastify(ship, scopes) {
    const bridge = await fastifyBridge(ship, { scopes });
    await bridge.listen({ port: 0, host: '127.0.0.1' });
    return { url: urlOf(bridge.server.address()), close: () => bridge.close() };
  },
};
```

`ContainerSource` is the adapters' type; import it from `@nexusdi/hono` (the three adapters declare it identically through the shared copy) and drop the `@nexusdi/core` type import if TypeScript reports it missing there.

`examples/bridge-api/e2e/bridge.e2e.ts`:

```ts
import { Nexus, type TraceEvent } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bridgePlugins } from '../src/ship/plugins';
import { meridian } from '../src/ship/meridian';
import { startRelay } from './relay';
import { servers } from './servers';

let relay: Awaited<ReturnType<typeof startRelay>>;
beforeAll(async () => {
  relay = await startRelay();
});
afterAll(async () => {
  await relay.close();
});

async function shipWithEvents() {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(meridian(relay.url), {
    plugins: bridgePlugins({ trace: (event) => events.push(event) }),
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((e) => e.type === type).length;
  return { ship, count };
}

/** Waits until `check` holds, for disposal that runs after the response ends. */
async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in 2 s');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.each(Object.entries(servers))(
  'the bridge API on %s',
  (_name, start) => {
    it('plots a course with the downloaded charts and the request mission', async () => {
      const { ship } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        const res = await fetch(`${bridge.url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'survey-7' },
        });
        expect(await res.json()).toEqual({
          course: { to: 'Kepler-442b', heading: 42 },
          entries: ['survey-7: plotting Kepler-442b'],
        });
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('gives 50 concurrent requests 50 scopes and no shared flight log', async () => {
      const { ship, count } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        const bodies = await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            fetch(`${bridge.url}/course/Proxima-b`, {
              headers: { 'x-mission-id': `survey-${i}` },
            }).then((r) => r.json() as Promise<{ entries: string[] }>),
          ),
        );
        bodies.forEach((body, i) =>
          expect(body.entries).toEqual([`survey-${i}: plotting Proxima-b`]),
        );
        await eventually(() => count('scope:dispose') === 50);
        expect(count('scope:create')).toBe(50);
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('creates no scope for a route that resolves nothing', async () => {
      const { ship, count } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        expect(await (await fetch(`${bridge.url}/health`)).text()).toBe('ok');
        expect(count('scope:create')).toBe(0);
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('answers 503 with no NEXUS_ in the body once the container is disposed', async () => {
      const { ship } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        await ship[Symbol.asyncDispose]();
        const res = await fetch(`${bridge.url}/course/Kepler-442b`);
        expect(res.status).toBe(503);
        expect(await res.text()).not.toContain('NEXUS_');
      } finally {
        await bridge.close();
      }
    });

    it('builds a function-form container once and downloads the charts once', async () => {
      const before = relay.downloads();
      let builds = 0;
      let built: Nexus | undefined;
      const bridge = await start(async () => {
        builds += 1;
        built = await Nexus.create(meridian(relay.url), {
          plugins: bridgePlugins(),
        });
        return built;
      });
      try {
        await Promise.all(
          Array.from({ length: 10 }, () =>
            fetch(`${bridge.url}/course/TRAPPIST-1e`),
          ),
        );
        expect(builds).toBe(1);
        expect(relay.downloads() - before).toBe(1);
      } finally {
        await bridge.close();
        await built?.[Symbol.asyncDispose]();
      }
    });

    it('gives a service the request scope through scopes.current()', async () => {
      const scopes = nodeScopes();
      const { ship } = await shipWithEvents();
      const bridge = await start(ship, scopes);
      try {
        const res = await fetch(`${bridge.url}/mission`, {
          headers: { 'x-mission-id': 'survey-3' },
        });
        expect(await res.json()).toEqual({ id: 'survey-3' });
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('answers { id: null } on /mission without scopes', async () => {
      const { ship } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        expect(await (await fetch(`${bridge.url}/mission`)).json()).toEqual({
          id: null,
        });
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('keeps the scope open while the stream writes, then disposes it once', async () => {
      const { ship, count } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        const text = await (
          await fetch(`${bridge.url}/log/stream`, {
            headers: { 'x-mission-id': 'survey-4' },
          })
        ).text();
        expect(text).toContain('data: survey-4: tick 3');
        await eventually(() => count('scope:dispose') === 1);
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('disposes the scope when the client aborts mid-stream', async () => {
      const { ship, count } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        const controller = new AbortController();
        const res = await fetch(`${bridge.url}/log/stream`, {
          signal: controller.signal,
        });
        await res.body!.getReader().read();
        controller.abort();
        await eventually(() => count('scope:dispose') === 1);
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });

    it('answers 500 with an empty body when the handler resolves an unbound token', async () => {
      const { ship } = await shipWithEvents();
      const bridge = await start(ship);
      try {
        const res = await fetch(`${bridge.url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'missing-provider' },
        });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe('');
      } finally {
        await bridge.close();
        await ship[Symbol.asyncDispose]();
      }
    });
  },
);
```

Add to `examples/bridge-api/project.json`:

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "@nexusdi/bridge-api",
  "targets": {
    "e2e": {
      "dependsOn": ["^build"],
      "executor": "nx:run-commands",
      "options": {
        "cwd": "examples/bridge-api",
        "command": "vitest run --config vitest.e2e.config.ts"
      }
    },
    "graph": {
      "dependsOn": ["^build"],
      "executor": "nx:run-commands",
      "options": {
        "cwd": "examples/bridge-api",
        "command": "nexusdi graph src/ship/meridian.ts#Meridian --plugins src/ship/plugins.ts#graphPlugins -f json -o graph.json && git diff --exit-code graph.json"
      }
    },
    "bench": {
      "dependsOn": ["^build"],
      "executor": "nx:run-commands",
      "options": {
        "cwd": "examples/bridge-api",
        "command": "vitest bench --run && node bench/cold.mjs"
      }
    }
  }
}
```

`--plugins` takes an exported array, so add to `src/ship/plugins.ts`: `export const graphPlugins: NexusPlugin[] = bridgePlugins();`.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:e2e`
Expected: before Steps 4 and 5 existed this failed on missing modules; now it runs. If a case fails, fix the entry, never the assertion. Expected: PASS, 30 cases (10 per framework).

- [ ] Step 8: The graph and the benchmark

Run: `cd examples/bridge-api && npx nexusdi graph src/ship/meridian.ts#Meridian --plugins src/ship/plugins.ts#graphPlugins -f json -o graph.json && cd ../..`
Then: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:graph`
Expected: PASS (the second run reproduces `graph.json` byte for byte).

`examples/bridge-api/bench/bridge.bench.ts` (spec 13.5, warm figures):

```ts
import { Nexus } from '@nexusdi/core';
import { Hono } from 'hono';
import { bench, describe } from 'vitest';

import { createBridge } from '../src/hono';
import { NAV_CHARTS } from '../src/ship/contracts';
import { OfflineMeridian } from '../src/ship/meridian';

const ship = await Nexus.create(OfflineMeridian);
const bridge = createBridge(ship);
const charts = ship.get(NAV_CHARTS);
const bare = new Hono().get('/course/:to', (c) =>
  c.json({ course: charts.plot(c.req.param('to')), entries: [] }),
);

describe('Nexus.create, warm', () => {
  bench('OfflineMeridian', async () => {
    const built = await Nexus.create(OfflineMeridian);
    await built[Symbol.asyncDispose]();
  });
});

describe('a request through Hono', () => {
  bench('bare Hono', async () => {
    await bare.request('/course/Kepler-442b');
  });
  bench('@nexusdi/hono with inject', async () => {
    await bridge.request('/course/Kepler-442b');
  });
});
```

`examples/bridge-api/bench/cold.mjs` (cold first `Nexus.create`, the 5.18 ms figure of spec 9.3, median of 25 fresh processes):

```js
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'bridge-cold-'));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  `import { Nexus } from '@nexusdi/core';
import { OfflineMeridian } from '${new URL('../src/ship/meridian.ts', import.meta.url).pathname}';
const start = performance.now();
const ship = await Nexus.create(OfflineMeridian);
console.log(performance.now() - start);
await ship[Symbol.asyncDispose]();
`,
);
const outfile = join(dir, 'cold.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'error',
});

const runs = Array.from({ length: 25 }, () =>
  Number(execFileSync(process.execPath, [outfile]).toString().trim()),
);
runs.sort((a, b) => a - b);
console.log(
  `cold Nexus.create(OfflineMeridian), median of 25 processes: ${runs[12].toFixed(2)} ms`,
);
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:bench`
Expected: the Vitest bench table and one `cold Nexus.create` line. The figures are not asserted; Task 26 copies them into `/runtimes/` with the machine and date.

- [ ] Step 9: Lint, test and commit

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint typecheck test e2e graph -p @nexusdi/bridge-api && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS.

```bash
git add examples/bridge-api commitlint.config.js package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(bridge-api): add the Meridian server demo on Hono, Express and Fastify

One module graph serves a Hono, an Express, a Fastify and a Workers entry,
and one e2e suite runs against the three Node servers with a local relay
for the charts download. MISSION lives in BridgeApi, and Tactical takes the
relay URL, so a Worker can read it from its bindings. NAV_AUDIT is a new
name for the demo's interceptor, listed in the ledger for the docs
vocabulary.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: `examples/react-ssr`: React Router 8, the adapters and the Meridian domain

Spec section 14 and react spec 9.1. The app keeps its project name, `@nexusdi/react-ssr`, and its Tailwind setup.

Files:

- Delete: `app/modules/` (logger and users), `app/shared/`, `app/components/UserCard.tsx`, `app/routes/users.tsx`, `tests/routes/users.spec.tsx`, `tests/routes/users.empty.spec.tsx`, `tests/routes/users.error.spec.tsx`, `tests/support/route-context.ts`
- Create: `app/nexus.server.ts`, `app/ship.client.ts`, `app/bridge/bridge.client.ts`, `app/navigation/navigation.module.ts`, `app/routes/sectors.tsx`, `app/components/CoursePlotter.tsx`, `tests/support/testing-di.ts`, `tests/routes/home.spec.tsx` (rewritten), `tests/routes/sectors.spec.tsx`, `e2e/serve.e2e.ts`, `vitest.e2e.config.ts`, `app/request.d.ts`
- Modify: `package.json`, `react-router.config.ts`, `vite.config.ts`, `app/routes.ts`, `app/root.tsx`, `app/entry.server.tsx`, `app/entry.client.tsx`, `app/routes/home.tsx`, `app/routes/layout.tsx`, `app/components/index.ts`, `project.json` (or the `nx` block in `package.json`)

Interfaces:

- Consumes: `nexus`, `NEXUS_SCOPE`, `existingScope` from `@nexusdi/react-router` (Task 9); `NexusProvider`, `useService` from `@nexusdi/react` (Tasks 11 and 13; props per react spec section 3: `container: Nexus | Promise<Nexus> | null`, `scope?: Scope`, `clientOnly?`, `dispose?`, `fallback?`); from `@nexusdi/bridge-api/ship` and `@nexusdi/bridge-api/contracts` (Task 18): `BridgeApi`, `OfflineTactical`, `meridian`, `OfflineMeridian`, `FLIGHT_LOG`, `NAV_CHARTS`, `INavCharts`, `Course`; `nexusFixtures` (Task 4).
- Produces: `di` and `ship` from `app/nexus.server.ts`; `shipReady` from `app/ship.client.ts`; `Navigation`, `NAV_ROUTES`, `INavRoutes` from `app/navigation/navigation.module.ts`.

`Navigation`, `NAV_ROUTES` and `INavRoutes` are the names of integrations spec 3.9's lazy-route sample; `BridgeClient` is the react spec's client graph name.

- [ ] Step 1: Move to React Router 8

In `examples/react-ssr/package.json` set `react-router`, `@react-router/node`, `@react-router/serve` and `@react-router/dev` to `8.4.0`, add `"@nexusdi/react-router": "*"`, `"@nexusdi/react": "*"`, `"@nexusdi/errors": "*"`, `"@nexusdi/bridge-api": "*"` to `dependencies` and `"@nexusdi/testing": "*"`, `"@nexusdi/vitest": "*"`, `"@nexusdi/devtools": "*"` to `devDependencies`. Delete the `v8_middleware` block from `react-router.config.ts`:

```ts
import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
} satisfies Config;
```

In `vite.config.ts`, add `ssr: { noExternal: ['@nexusdi/bridge-api'] }` at the top level of the returned config (the package exports TypeScript sources). Run `npm install`.

`app/request.d.ts`:

```ts
import '@nexusdi/core';

declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}
```

- [ ] Step 2: Write the failing route tests

`tests/support/testing-di.ts` builds the `di` the mocked `nexus.server` exports, on a testing container with the fixtures' overrides, as integrations spec 7.2 shows:

```ts
import type { Nexus } from '@nexusdi/core';

/** Containers the mocked nexus.server built, disposed after the file's tests. */
export const built: Nexus[] = [];
```

`tests/routes/home.spec.tsx`:

```tsx
import { afterAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, RouterContextProvider } from 'react-router';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import { createTestingContainer } from '@nexusdi/testing';
import {
  FLIGHT_LOG,
  NAV_CHARTS,
  type IFlightLog,
} from '@nexusdi/bridge-api/contracts';
import { Meridian } from '@nexusdi/bridge-api/ship';

import { built } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () => {
  const { nexus } = await import('@nexusdi/react-router');
  const { createTestingContainer } = await import('@nexusdi/testing');
  const { FLIGHT_LOG, NAV_CHARTS } =
    await import('@nexusdi/bridge-api/contracts');
  const { Meridian } = await import('@nexusdi/bridge-api/ship');
  const { built } = await import('../support/testing-di');
  const ship = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, {
      useValue: { plot: (to: string) => ({ to, heading: 42 }) },
    })
    .override(FLIGHT_LOG, {
      useClass: class {
        #e: string[] = [];
        record(e: string) {
          this.#e.push(e);
        }
        entries() {
          return this.#e;
        }
      },
    })
    .create({ onInit: false });
  built.push(ship);
  return { di: nexus(ship), ship };
});

const { default: Home, loader, action } = await import('../../app/routes/home');

afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

async function scopeOf(id: string) {
  const ship = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, {
      useValue: { plot: (to: string) => ({ to, heading: 42 }) },
    })
    .create({ onInit: false });
  built.push(ship);
  return ship.createScope({
    request: { mission: { id, target: 'Kepler-442b' } },
  });
}

describe('Home route', () => {
  it('renders the mission and a fresh flight log from the request scope', async () => {
    const scope = await scopeOf('survey-7');
    const Stub = createRoutesStub(
      [{ path: '/', Component: Home, loader, action }],
      new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]])),
    );
    render(<Stub initialEntries={['/']} />);
    await waitFor(() => {
      expect(screen.getByText('survey-7')).toBeDefined();
      expect(screen.getByText('survey-7: docked')).toBeDefined();
    });
    await scope[Symbol.asyncDispose]();
  });

  it('keeps no flight log entry from one request to the next', async () => {
    const first = await scopeOf('survey-1');
    const second = await scopeOf('survey-2');
    const read = (scope: typeof first) =>
      loader({
        params: {},
        context: new RouterContextProvider(
          new Map([[NEXUS_SCOPE, existingScope(scope)]]),
        ),
        request: new Request('http://bridge/'),
      } as never);
    expect((await read(first)).entries).toEqual(['survey-1: docked']);
    expect((await read(second)).entries).toEqual(['survey-2: docked']);
    expect(first.get(FLIGHT_LOG).entries()).not.toContain('survey-2: docked');
    await first[Symbol.asyncDispose]();
    await second[Symbol.asyncDispose]();
  });
});

type Unused = IFlightLog;
```

Delete the trailing `type Unused` line if lint reports it unused; it only documents that the test reads `IFlightLog` through the real `ShuttleFlightLog` (the scope builds the production `FLIGHT_LOG`, which prefixes the mission id).

`tests/routes/sectors.spec.tsx`:

```tsx
import { afterAll, describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';

import { built } from '../support/testing-di';

vi.mock('../../app/nexus.server', async () => {
  const { nexus } = await import('@nexusdi/react-router');
  const { Nexus } = await import('@nexusdi/core');
  const { OfflineMeridian } = await import('@nexusdi/bridge-api/ship');
  const { built } = await import('../support/testing-di');
  const ship = await Nexus.create(OfflineMeridian);
  built.push(ship);
  return { di: nexus(ship), ship };
});

const { loader, middleware } = await import('../../app/routes/sectors');
const { ship } = await import('../../app/nexus.server');

afterAll(() => Promise.all(built.map((s) => s[Symbol.asyncDispose]())));

describe('the lazy sectors route', () => {
  it('loads Navigation before its loader resolves NAV_ROUTES', async () => {
    const scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    const context = new RouterContextProvider(
      new Map([[NEXUS_SCOPE, existingScope(scope)]]),
    );
    const args = {
      params: { sector: 'Kepler-442b' },
      context,
      request: new Request('http://bridge/sectors/Kepler-442b'),
    } as never;
    const response = await middleware[0](args, async () =>
      Response.json(await loader(args)),
    );
    expect(await (response as Response).json()).toEqual({
      route: { to: 'Kepler-442b', heading: 42 },
    });
    await scope[Symbol.asyncDispose]();
  });
});
```

The scope here is created before `di.load(Navigation)` runs, so the test also proves the `extend()` step of spec 3.9.

- [ ] Step 3: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/react-ssr`
Expected: FAIL, cannot find `../../app/nexus.server` and `../../app/routes/sectors`.

- [ ] Step 4: Implement the server and client graphs

Delete the files listed under "Delete" (`git rm -r`).

`app/nexus.server.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { meridian, OfflineMeridian } from '@nexusdi/bridge-api/ship';
import { nexus } from '@nexusdi/react-router';

const root = process.env.RELAY_URL
  ? meridian(process.env.RELAY_URL)
  : OfflineMeridian;

export const ship = await Nexus.create(root, {
  plugins: import.meta.env.DEV ? [errors()] : [],
});
import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]());

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});
```

`app/bridge/bridge.client.ts`:

```ts
import { defineModule } from '@nexusdi/core';
import { OfflineTactical } from '@nexusdi/bridge-api/ship';

/** The client graph: NAV_CHARTS over the bundled table, a singleton, so components read it outside a ScopeProvider (react spec 9.1). */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [OfflineTactical],
});
```

`app/ship.client.ts`:

```ts
import { Nexus } from '@nexusdi/core';

import { BridgeClient } from './bridge/bridge.client';

export const shipReady =
  typeof window === 'undefined' ? null : Nexus.create(BridgeClient);
```

`app/navigation/navigation.module.ts`:

```ts
import { defineModule, provide, Token } from '@nexusdi/core';
import {
  NAV_CHARTS,
  type Course,
  type INavCharts,
} from '@nexusdi/bridge-api/contracts';

export interface INavRoutes {
  find(sector: string): Course;
}
export const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');

class SectorRoutes implements INavRoutes {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  find(sector: string) {
    return this.charts.plot(sector);
  }
}

/** Loaded by the sectors route on its first request, with di.load (spec 3.9). */
export const Navigation = defineModule({
  name: 'Navigation',
  imports: [],
  providers: [provide(NAV_ROUTES, { useClass: SectorRoutes })],
  exports: [NAV_ROUTES],
});
```

`Navigation` reads `NAV_CHARTS` from the root: `ship.load()` adds the module's exports at the root, and the module sees the root's exports through `load()`'s rules. If `ship.load(Navigation)` reports `NEXUS_BLUEPRINT_INVALID` for `NAV_CHARTS`, import the tactical module the root uses: build `Navigation` as a function of that module in `nexus.server.ts` and export it there.

`app/routes/sectors.tsx`:

```tsx
import { Navigation, NAV_ROUTES } from '../navigation/navigation.module';
import { di } from '../nexus.server';
import type { Route } from './+types/sectors';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: Route.LoaderArgs) => ({
    route: routes.find(params.sector),
  }),
);

export default function Sector({ loaderData }: Route.ComponentProps) {
  return (
    <p>
      {loaderData.route.to}: heading {loaderData.route.heading}
    </p>
  );
}
```

`app/routes.ts`:

```ts
import {
  type RouteConfig,
  route,
  layout,
  index,
} from '@react-router/dev/routes';

export default [
  layout('./routes/layout.tsx', [
    index('./routes/home.tsx'),
    route('sectors/:sector', './routes/sectors.tsx'),
  ]),
] satisfies RouteConfig;
```

`app/routes/home.tsx`:

```tsx
import { Form } from 'react-router';
import { FLIGHT_LOG, NAV_CHARTS } from '@nexusdi/bridge-api/contracts';
import { MISSION } from '@nexusdi/bridge-api/contracts';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Section,
} from '../components';
import { CoursePlotter } from '../components/CoursePlotter';
import { di } from '../nexus.server';
import type { Route } from './+types/home';

export const loader = di.inject(
  { log: FLIGHT_LOG, mission: MISSION, charts: NAV_CHARTS },
  ({ log, mission, charts }) => {
    log.record('docked');
    return {
      mission: mission.id,
      course: charts.plot(mission.target),
      entries: log.entries(),
    };
  },
);

export const action = di.inject(
  { log: FLIGHT_LOG },
  async ({ log }, { request }: Route.ActionArgs) => {
    const entry = String((await request.formData()).get('entry') ?? '');
    log.record(entry);
    return { entries: log.entries() };
  },
);

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const entries = actionData?.entries ?? loaderData.entries;
  return (
    <>
      <Section>
        <Card>
          <CardHeader>
            <CardTitle>Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{loaderData.mission}</p>
            <p>
              {loaderData.course.to}: heading {loaderData.course.heading}
            </p>
          </CardContent>
        </Card>
      </Section>
      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Flight log
        </h2>
        <ul>
          {entries.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <Form method="post">
          <input name="entry" defaultValue="course plotted" />
          <Button type="submit">Record</Button>
        </Form>
      </Section>
      <Section>
        <CoursePlotter />
      </Section>
    </>
  );
}
```

The flight log lives in the request scope, so an entry recorded by the action shows in that response only. That replaces the module-level `let user`, which shared one value across every request.

`app/components/CoursePlotter.tsx`, the component that reads a service in render through `@nexusdi/react`:

```tsx
import { useState } from 'react';
import { useService } from '@nexusdi/react';
import { NAV_CHARTS } from '@nexusdi/bridge-api/contracts';

export function CoursePlotter() {
  const charts = useService(NAV_CHARTS);
  const [to, setTo] = useState('Proxima-b');
  const course = charts.plot(to);
  return (
    <label>
      Plot a course to{' '}
      <input value={to} onChange={(event) => setTo(event.target.value)} />
      <span> heading {course.heading}</span>
    </label>
  );
}
```

`NAV_CHARTS` is a singleton in both graphs and both plot over the bundled table (when `RELAY_URL` is unset), so the server HTML and the hydration render agree.

Remove `UserCard` from `app/components/index.ts`. In `app/routes/layout.tsx`, replace the Users nav button with `<Button as="link" to="/sectors/Kepler-442b" variant="outline">Sectors</Button>` and the header text with `<h1 className="text-4xl font-bold dark:text-white">Bridge</h1>` and `<p className="text-lg text-gray-600 dark:text-gray-400">The Meridian bridge API on React Router.</p>`.

`app/root.tsx`: replace the middleware imports and array with

```tsx
import { di } from './nexus.server';

export const middleware: Route.MiddlewareFunction[] = [di.middleware];
```

and keep the rest of the file.

`app/entry.server.tsx`: read the request scope from `loadContext` and wrap the router in `NexusProvider` (react spec 9.1). Change the signature's last parameter to `loadContext: RouterContextProvider`, and before `renderToPipeableStream` add:

```tsx
const scope = await loadContext.get(NEXUS_SCOPE).scope();
```

which makes `handleRequest` `async` (return the existing `new Promise(...)`). Render:

```tsx
<NexusProvider container={ship} scope={scope}>
  <ServerRouter context={routerContext} url={request.url} />
</NexusProvider>
```

with `import { NexusProvider } from '@nexusdi/react'; import { NEXUS_SCOPE } from '@nexusdi/react-router'; import { ship } from './nexus.server';`. Set `export const streamTimeout = 4_950;` back to React Router's default if it differs; the adapter's body wrapper disposes the scope when the stream ends (spec 7.3).

`app/entry.client.tsx`: wrap `<HydratedRouter />` in `<NexusProvider container={shipReady}>` with `import { shipReady } from './ship.client';`.

- [ ] Step 5: Run the route tests

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t typegen typecheck test -p @nexusdi/react-ssr`
Expected: PASS (3 tests).

- [ ] Step 6: Write the failing serve test

`examples/react-ssr/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/react-ssr:e2e',
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```

`examples/react-ssr/e2e/serve.e2e.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const dir = new URL('..', import.meta.url).pathname;
let child: ChildProcess | undefined;

async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('no TCP address');
  server.close();
  await once(server, 'close');
  return address.port;
}

/** A fresh react-router-serve process on the built app: no module loaded yet. */
async function serve(): Promise<string> {
  const port = await freePort();
  child = spawn(
    process.execPath,
    [require.resolve('@react-router/serve/bin.js'), './build/server/index.js'],
    {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    },
  );
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await fetch(url, { method: 'HEAD' });
      return url;
    } catch {
      if (Date.now() > deadline)
        throw new Error('react-router-serve did not answer in 30 s');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

afterEach(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) await once(child, 'exit');
  child = undefined;
});

describe('the built app', () => {
  it('serves the lazy sectors route as the first request on a fresh server', async () => {
    const url = await serve();
    const res = await fetch(`${url}/sectors/Kepler-442b`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Kepler-442b: heading 42');
  });

  it('renders the home page with the request mission and its own flight log', async () => {
    const url = await serve();
    const [a, b] = await Promise.all([
      fetch(url, { headers: { 'x-mission-id': 'survey-1' } }).then((r) =>
        r.text(),
      ),
      fetch(url, { headers: { 'x-mission-id': 'survey-2' } }).then((r) =>
        r.text(),
      ),
    ]);
    expect(a).toContain('survey-1: docked');
    expect(a).not.toContain('survey-2');
    expect(b).toContain('survey-2: docked');
  });

  it('ships no server container module to the client build', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const assets = new URL('../build/client/assets/', import.meta.url);
    for (const file of await readdir(assets)) {
      if (!file.endsWith('.js')) continue;
      const text = await readFile(new URL(file, assets), 'utf8');
      expect(text, file).not.toContain('relay.meridian.invalid');
      expect(text, file).not.toContain('x-mission-id');
    }
  });
});
```

The client-build check looks for two strings that only server code holds: the default relay URL (from `meridian.ts`) and the mission header name (from `nexus.server.ts`). The client graph imports `OfflineTactical` from `@nexusdi/bridge-api/ship`, so if a bundler pulls `meridian.ts` through the package's index, the first assertion fails: then import `OfflineTactical` from a dedicated export (`"./offline": "./src/ship/tactical.module.ts"` in bridge-api's `exports`) in `bridge.client.ts`.

Add the `e2e` target to the `nx.targets` block in `examples/react-ssr/package.json`:

```json
"e2e": {
  "dependsOn": ["build", "^build"],
  "executor": "nx:run-commands",
  "options": { "cwd": "examples/react-ssr", "command": "vitest run --config vitest.e2e.config.ts" }
}
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/react-ssr:e2e`
Expected: PASS (3 cases). A FAIL on the first case with a 500 means the lazy route ran its loader before `di.load`, which is the stale-scope bug of spec 3.9: fix the route module, not the test.

- [ ] Step 7: Lint, test and commit

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint typegen typecheck test e2e -p @nexusdi/react-ssr && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS. `react-pair.test.ts` still sees one `react`/`react-dom` spec; `doc-domain` no longer finds the users and logger names.

```bash
git add -A examples/react-ssr package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(examples): move react-ssr to React Router 8 and the Meridian bridge

The app now takes its request scope from @nexusdi/react-router and its
client container from @nexusdi/react, and serves the bridge API's flight
log and charts. The flight log lives in the request scope, which replaces
the module-level user that every request shared. A lazy sectors route
loads Navigation with di.load and is tested as the first request on a
fresh server.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: `examples/next-bridge`: the Next demo on `@nexusdi/next`

Runs only when Task 16's gate is open. Replaces the gate's hand-written scope with `@nexusdi/next`, serves the bridge API's graph, and decides D9.

Files:

- Delete: `app/ship/gate.module.ts`, `app/gate/` (the page and form move to `app/console/`)
- Create: `app/trace-counter.ts`, `app/course/[to]/route.ts`, `app/course/[to]/stream/route.ts`, `app/api/fail/route.ts`, `app/api/missing/route.ts`, `app/api/trace/route.ts`, `app/console/page.tsx`, `app/console/console-form.tsx`, `test/check.test.ts`, `e2e/bridge.e2e.ts`, `vitest.config.ts`
- Modify: `package.json`, `next.config.ts` (or `.js`, as generated), `app/nexus.server.ts`, `app/actions.ts`, `e2e/gate.e2e.ts` (paths), `project.json`
- Remove: `app/api/course/[to]/route.ts` (moves to `app/course/[to]/route.ts`)

Interfaces:

- Consumes: `nexus` from `@nexusdi/next` (Task 17); `meridian`, `OfflineMeridian`, `bridgePlugins`, `FLIGHT_LOG`, `NAV_CHARTS` from `@nexusdi/bridge-api` (Task 18); `startNext` (Task 16); `gateCounters` (Task 16).
- Produces: `GET /course/:to`, `GET /course/:to/stream`, `GET /api/fail`, `GET /api/missing`, `GET /api/trace` (`{ creates: number; disposes: number }`), the `/console` page with the `recordEntry` action.

- [ ] Step 1: Write the failing e2e suite

Add `"@nexusdi/next": "*"`, `"@nexusdi/bridge-api": "*"` and `"@nexusdi/errors": "*"` to `dependencies`, and `"@nexusdi/testing": "*"` and `"vitest": "4.1.9"` to `devDependencies` in `examples/next-bridge/package.json`. Run `npm install`.

`examples/next-bridge/e2e/bridge.e2e.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startNext } from './next-server';

const dir = new URL('..', import.meta.url).pathname;
let server: Awaited<ReturnType<typeof startNext>>;

beforeAll(async () => {
  server = await startNext(dir);
});
afterAll(async () => {
  await server?.close();
});

async function counters(): Promise<{ creates: number; disposes: number }> {
  return (await fetch(`${server.url}/api/trace`)).json();
}

/** Polls /api/trace until `check` holds or `ms` pass; returns whether it held. */
async function within(
  ms: number,
  check: (c: { creates: number; disposes: number }) => boolean,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check(await counters())) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function actionField(html: string): string {
  const match = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(html);
  if (match === null) throw new Error('no $ACTION_ID_ field in /console');
  return match[1];
}

describe('the bridge API on Next', () => {
  it('plots a course in a route handler with the request mission', async () => {
    const res = await fetch(`${server.url}/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-7' },
    });
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      entries: ['survey-7: plotting Kepler-442b'],
    });
  });

  it('records a flight log entry through a server action', async () => {
    const page = await fetch(`${server.url}/console`);
    const form = new FormData();
    form.set(actionField(await page.text()), '');
    form.set('entry', 'docked');
    const res = await fetch(`${server.url}/console`, {
      method: 'POST',
      body: form,
      headers: { 'x-mission-id': 'survey-8' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('survey-8: docked');
  });

  it('keeps the scope open until a streamed body ends, then disposes it', async () => {
    const before = await counters();
    const res = await fetch(`${server.url}/course/Proxima-b/stream`, {
      headers: { 'x-mission-id': 'survey-9' },
    });
    const text = await res.text();
    expect(text).toContain('survey-9: plotting Proxima-b');
    expect(text).toContain('survey-9: arrived');
    expect(await within(2_000, (c) => c.disposes - before.disposes === 1)).toBe(
      true,
    );
  });

  it('disposes the scope within 5 s of a client abort mid-stream (D9)', async () => {
    const before = await counters();
    const controller = new AbortController();
    const res = await fetch(`${server.url}/course/Proxima-b/stream?ticks=100`, {
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();
    expect(await within(5_000, (c) => c.disposes - before.disposes === 1)).toBe(
      true,
    );
  });

  it('leaves a handler error to Next as a 500', async () => {
    const res = await fetch(`${server.url}/api/fail`);
    expect(res.status).toBe(500);
  });

  it('answers 500 with an empty body for a token with no provider', async () => {
    const res = await fetch(`${server.url}/api/missing`);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('');
  });

  it('gives 50 concurrent requests 50 scopes and disposes each', async () => {
    const before = await counters();
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${server.url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': `survey-${i}` },
        }).then((r) => r.json() as Promise<{ entries: string[] }>),
      ),
    );
    bodies.forEach((body, i) =>
      expect(body.entries).toEqual([`survey-${i}: plotting Kepler-442b`]),
    );
    expect(
      await within(
        2_000,
        (c) =>
          c.creates - before.creates === 50 &&
          c.disposes - before.disposes === 50,
      ),
    ).toBe(true);
  });

  it('ships no server container code to the browser', async () => {
    const files: string[] = [];
    async function walk(path: string) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    }
    await walk(join(dir, '.next/static'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toContain('next-bridge:server');
      expect(text, file).not.toContain('nexus.js.org/errors');
    }
  });
});
```

`next-bridge:server` is a marker string in `nexus.server.ts`; `nexus.js.org/errors` is core's docs URL (`DOCS_URL`), which every core bundle holds.

Rewrite `e2e/gate.e2e.ts` for the new paths, keeping its assertion: route `GET /course/Kepler-442b` expecting `{ course: { to: 'Kepler-442b', heading: 42 }, entries: ['survey-7: plotting Kepler-442b'] }`, page `/console`, action field read from `/console` and posted there, and `/api/gate` expecting `{ evaluations: 1, creates: 1 }`. The gate test runs in a fresh `next start` of its own, before the bridge suite (`fileParallelism: false` and file order: rename it `e2e/0-gate.e2e.ts`).

`examples/next-bridge/test/check.test.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import {
  bridgePlugins,
  Meridian,
  OfflineMeridian,
} from '@nexusdi/bridge-api/ship';
import { describe, expect, it } from 'vitest';

describe('the graph the Next app builds', () => {
  it('compiles with no user code, so a wrong token fails CI (spec 10.3)', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
    expect(() =>
      Nexus.check(OfflineMeridian, { plugins: bridgePlugins() }),
    ).not.toThrow();
  });
});
```

`examples/next-bridge/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@nexusdi/next-bridge',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

Add a `test` target if `@nx/vitest` does not infer one from `vitest.config.ts` (check with `nx show project @nexusdi/next-bridge`).

- [ ] Step 2: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/next-bridge:e2e`
Expected: FAIL. `/course/Kepler-442b` is 404 (the route still lives under `/api/course`) and `/api/trace` does not exist.

- [ ] Step 3: Implement the app on `@nexusdi/next`

`next.config.ts`: add `transpilePackages: ['@nexusdi/bridge-api']` (the package exports TypeScript sources).

`app/trace-counter.ts`:

```ts
interface TraceCounters {
  creates: number;
  disposes: number;
}

const KEY = Symbol.for('next-bridge.trace');

/** Scope events across the process, read by /api/trace. */
export function traceCounters(): TraceCounters {
  const slot = globalThis as { [KEY]?: TraceCounters };
  slot[KEY] ??= { creates: 0, disposes: 0 };
  return slot[KEY];
}
```

`app/nexus.server.ts`:

```ts
import 'server-only';

import { Nexus } from '@nexusdi/core';
import {
  bridgePlugins,
  meridian,
  OfflineMeridian,
} from '@nexusdi/bridge-api/ship';
import { nexus } from '@nexusdi/next';
import { headers } from 'next/headers';

import { gateCounters } from './gate-counter';
import { traceCounters } from './trace-counter';

/** A string only server code holds; the client-build check looks for it. */
export const SERVER_MARKER = 'next-bridge:server';

gateCounters().evaluations += 1;

const root = process.env.RELAY_URL
  ? meridian(process.env.RELAY_URL)
  : OfflineMeridian;

export const di = nexus(
  () =>
    Nexus.create(root, {
      plugins: bridgePlugins({
        dev: process.env.NODE_ENV === 'development',
        trace: (event) => {
          if (event.type === 'compile' && event.phase === 'create')
            gateCounters().creates += 1;
          if (event.type === 'scope:create') traceCounters().creates += 1;
          if (event.type === 'scope:dispose') traceCounters().disposes += 1;
        },
      }),
    }),
  {
    request: async () => ({
      mission: {
        id: (await headers()).get('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
  },
);
```

`app/course/[to]/route.ts` (spec 10.3):

```ts
import { FLIGHT_LOG, NAV_CHARTS } from '@nexusdi/bridge-api/contracts';

import { di } from '../../nexus.server';

export const dynamic = 'force-dynamic';

export const GET = di.route(
  { charts: NAV_CHARTS, log: FLIGHT_LOG },
  async (
    { charts, log },
    _request,
    { params }: { params: Promise<{ to: string }> },
  ) => {
    const { to } = await params;
    log.record(`plotting ${to}`);
    return Response.json({ course: charts.plot(to), entries: log.entries() });
  },
);
```

`app/course/[to]/stream/route.ts`, a body that reads the scoped flight log after the handler returned:

```ts
import { FLIGHT_LOG } from '@nexusdi/bridge-api/contracts';

import { di } from '../../../nexus.server';

export const dynamic = 'force-dynamic';

export const GET = di.route(
  { log: FLIGHT_LOG },
  async ({ log }, request, { params }: { params: Promise<{ to: string }> }) => {
    const { to } = await params;
    const ticks = Number(new URL(request.url).searchParams.get('ticks') ?? '3');
    log.record(`plotting ${to}`);
    const encoder = new TextEncoder();
    let tick = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        tick += 1;
        if (tick === ticks) log.record('arrived');
        controller.enqueue(encoder.encode(`${log.entries().join('\n')}\n`));
        if (tick >= ticks) controller.close();
      },
    });
    return new Response(body, { headers: { 'content-type': 'text/plain' } });
  },
);
```

`app/api/fail/route.ts`:

```ts
import { FLIGHT_LOG } from '@nexusdi/bridge-api/contracts';

import { di } from '../../nexus.server';

export const dynamic = 'force-dynamic';

export const GET = di.route({ log: FLIGHT_LOG }, () => {
  throw new Error('sector not charted');
});
```

`app/api/missing/route.ts`, a token no module provides. With the function form the check runs on the first request (spec 3.3), so the route module loads and the request answers 500:

```ts
import { Token } from '@nexusdi/core';

import { di } from '../../nexus.server';

export const dynamic = 'force-dynamic';

const UNCHARTED = new Token<{ plot(): void }>('Uncharted');

export const GET = di.route(
  { uncharted: UNCHARTED },
  () => new Response('unreachable'),
);
```

`app/api/trace/route.ts`:

```ts
import { traceCounters } from '../../trace-counter';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ...traceCounters() });
}
```

`app/actions.ts`:

```ts
'use server';

import { FLIGHT_LOG } from '@nexusdi/bridge-api/contracts';

import { di } from './nexus.server';

export const recordEntry = di.action(
  { log: FLIGHT_LOG },
  async ({ log }, _previous: string, form: FormData) => {
    log.record(String(form.get('entry') ?? ''));
    return log.entries().join('\n');
  },
);
```

`app/console/page.tsx` and `app/console/console-form.tsx`: the gate's page and form from Task 16 under the new path, with the permalink argument `'/console'`. Delete `app/gate/`, `app/ship/gate.module.ts` and `app/api/course/`.

- [ ] Step 4: Run the suite and decide D9

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test e2e -p @nexusdi/next-bridge`
Expected: PASS, 8 bridge cases plus the gate.

If every case passes but the abort case, `after()` is still pending 5 s after the client left. Apply D9:

1. `cp libs/hono/src/internal/dispose-with-body.ts libs/next/src/internal/dispose-with-body.ts`.
2. In `libs/next/src/nexus.ts`, have `route` wrap the handler's response and dispose at the first of body end and `request.signal` abort, keeping `after()` for responses with no body:

```ts
route(deps, handler) {
  const check = checked(deps);
  return async (request, ...rest) => {
    const handle = requestScope(container, () => mapRequest?.());
    const dispose = once(() => handle.close().catch((error: unknown) => log(error, { adapter: ADAPTER, phase: 'dispose' })));
    request.signal.addEventListener('abort', dispose, { once: true });
    after(dispose);
    try {
      const response = await withScope(handle, deps, check, (resolved) => handler(resolved, request, ...rest));
      return disposeWithBody(response, dispose, request.method);
    } catch (error) {
      if (!(error instanceof NexusHttpError)) throw error;
      return new Response(null, { status: error.status, statusText: error.message });
    }
  };
},
```

with `once` from `./internal/request-scope.js` and `disposeWithBody` from `./internal/dispose-with-body.js`. `once` makes the three signals dispose one time. 3. Add a unit test to `libs/next/src/nexus.test.ts` that cancels a streamed body's reader and asserts one `scope:dispose` before `flushAfter()` runs. 4. In the spec, change D9's last sentence to "The abort test of section 10.6 failed on Next 16.4.1, so `@nexusdi/next` holds the third copy of `dispose-with-body.ts`." and section 3.7's count to "three of `dispose-with-body.ts`". 5. Rerun `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test -p @nexusdi/next @nexusdi/repo-checks && NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/next-bridge:e2e`. Expected: PASS, with `adapter-shared-copies` finding three identical copies.

If the abort case passes, record in the ledger: "D9: after() disposed within 5 s of the abort on Next 16.4.1; no body wrapper in @nexusdi/next."

- [ ] Step 5: Lint and commit

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint typecheck test e2e -p @nexusdi/next-bridge && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks`
Expected: PASS.

```bash
git add -A examples/next-bridge libs/next specs/2026-09-23-integrations-design.md package-lock.json .superpowers/sdd/integrations-0.4/progress.md
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(next-bridge): serve the bridge API through @nexusdi/next

Route handlers and a server action resolve the bridge API's flight log
and charts through di.route and di.action. The e2e suite covers a stream
that reads the scope after the handler returned, a client abort, a
handler error, a missing provider and 50 concurrent requests, and checks
that the client build holds no server container code. The abort case
settles D9.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: adapter-runtimes, the workerd leg

Spec 9.2, 9.4, 9.7 and 9.8. The bridge API's Hono entry runs inside workerd through `@cloudflare/vitest-pool-workers`, twice: with `enable_request_signal` and without it.

Files:

- Create: `examples/bridge-api/src/worker.offline.ts`, `examples/bridge-api/worker-configuration.d.ts` (generated), `examples/bridge-api/wrangler.jsonc`, `examples/bridge-api/wrangler.no-signal.jsonc`, `examples/bridge-api/vitest.workers.config.ts`, `examples/bridge-api/test/worker/env.d.ts`, `examples/bridge-api/test/worker/harness.ts`, `examples/bridge-api/test/worker/module-scope.test.ts`, `examples/bridge-api/test/worker/function-form.test.ts`, `examples/bridge-api/test/worker/disposal.test.ts`, `tools/repo-checks/src/adapter-runtimes-workflow.test.ts`
- Modify: `examples/bridge-api/package.json` (dev dependencies and the `test-workers` target), `examples/bridge-api/tsconfig.app.json` (the generated env types), `.github/workflows/ci.yml` (job `adapter-runtimes`, leg `workerd`)
- Delete: `examples/bridge-api/src/worker-env.d.ts`

Interfaces:

- Consumes (Task 18): `createBridge(ship: ContainerSource, options?: BridgeOptions): Hono` and `BridgeOptions = { scopes?: { run<R>(scope: Scope, fn: () => R): R; current?(): Scope | undefined }; log?: NexusLog }` from `examples/bridge-api/src/hono.ts`; `meridian(relayUrl)`, `Meridian`, `OfflineMeridian`, `DEFAULT_RELAY_URL` from `src/ship/meridian.ts`; `NAV_CHARTS`, `FLIGHT_LOG`, `MISSION`, `INavCharts`, `Course` from `src/ship/contracts.ts`; the default export of `src/worker.ts` (the function form: `env.RELAY_URL ? meridian(env.RELAY_URL) : OfflineMeridian`, env read from `cloudflare:workers`); `src/worker-env.d.ts`, which this task replaces.
- Consumes (Task 18), routes: `GET /health` (no scope); `GET /course/:to` answers `{ course, entries }`; `x-mission-id: missing-provider` answers 500 with an empty body; `GET /mission` answers `{ id }` from `scopes.current()`, `{ id: null }` when `scopes` is unset; `GET /log/stream` sends 3 SSE entries, one per 50 ms (`data: <mission>: tick N`); a disposed container answers 503 with an empty body.
- Consumes (Task 7): `nexus`, `ContainerSource`, `NexusLog` from `@nexusdi/hono`.
- Produces: the CI job `adapter-runtimes` with a `leg` matrix; Task 22 adds the legs `deno`, `bun` and `edge-runtime` to it.

- [ ] **Step 1: Write the failing workflow check** `tools/repo-checks/src/adapter-runtimes-workflow.test.ts`

```ts
import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  strategy?: { 'fail-fast'?: boolean; matrix?: { leg?: string[] } };
  steps: Step[];
}

const ci = parse(
  readFileSync(join(workspaceRoot, '.github/workflows/ci.yml'), 'utf-8'),
) as { on: Record<string, unknown>; jobs: Record<string, Job> };

/**
 * Spec 9.8: the bridge API's suite runs on every edge runtime the spec
 * names, on every push and pull request, so `adapter-runtimes` can be a
 * required check. The job runs no `nx run-many` (release-verify-gate holds
 * exactly one in ci.yml).
 */
describe('adapter-runtimes job', () => {
  const job = ci.jobs['adapter-runtimes'];

  it('exists and keeps every leg running when one fails', () => {
    expect(job).toBeDefined();
    expect(job.strategy?.['fail-fast']).toBe(false);
  });

  it('runs the workerd leg', () => {
    expect(job.strategy?.matrix?.leg).toContain('workerd');
    const runs = job.steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('nx run @nexusdi/bridge-api:test-workers');
  });

  it('pins every action by SHA and runs no nx run-many', () => {
    for (const step of job.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
      expect(step.run ?? '').not.toContain('nx run-many');
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-runtimes-workflow`
Expected: FAIL, `expected undefined to be defined` (no `adapter-runtimes` job).

- [ ] **Step 3: Install the workerd toolchain in the demo app**

```bash
npm install --workspace @nexusdi/bridge-api --save-dev --save-exact wrangler@4.151.0 @cloudflare/vitest-pool-workers@0.23.0
```

`@cloudflare/vitest-pool-workers` 0.23.0 declares `vitest ^4.1.0`, which the workspace's 4.1.9 meets. Before writing the config, read `node_modules/@cloudflare/vitest-pool-workers/README.md` and confirm that 0.23.0 exports `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config` and the `cloudflare:test` module with `env`, `SELF`, `createExecutionContext` and `waitOnExecutionContext`. If the README names a different config entry for Vitest 4, use that entry in Step 4 with the same `wrangler.configPath` and `miniflare` options; the test files do not change.

- [ ] **Step 4: Write the two wrangler configs and the Vitest config**

`examples/bridge-api/wrangler.jsonc`:

```jsonc
{
  // The bridge API on Workers (spec 9.2). From compatibility date
  // 2026-08-04, nodejs_compat is on by default, so node:async_hooks resolves
  // for nodeScopes(). enable_request_signal makes request.signal abort when
  // the client disconnects (spec 9.7).
  "name": "bridge-api",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["enable_request_signal"],
  // Empty, so src/worker.ts builds OfflineMeridian. An environment that reads
  // the relay sets it.
  "vars": { "RELAY_URL": "" },
}
```

`examples/bridge-api/wrangler.no-signal.jsonc`:

```jsonc
{
  // The same Worker without enable_request_signal. The disposal test reads
  // which config it runs under and asserts what the body wrapper alone does
  // on an abort (spec 9.7).
  "name": "bridge-api-no-signal",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": [],
  "vars": { "RELAY_URL": "" },
}
```

`examples/bridge-api/vitest.workers.config.ts`:

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// SIGNAL=off runs the suite against wrangler.no-signal.jsonc. The CI leg runs
// both, so /runtimes/ can state what an abort does with and without the flag.
const signal = process.env['SIGNAL'] !== 'off';

export default defineWorkersConfig({
  test: {
    name: `@nexusdi/bridge-api:workers:${signal ? 'signal' : 'no-signal'}`,
    include: ['test/worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: {
          configPath: signal
            ? './wrangler.jsonc'
            : './wrangler.no-signal.jsonc',
        },
        miniflare: { bindings: { SIGNAL: signal ? 'on' : 'off' } },
      },
    },
  },
});
```

`examples/bridge-api/test/worker/env.d.ts`:

```ts
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    readonly SIGNAL: 'on' | 'off';
  }
}
```

- [ ] **Step 5: Write the module-scope entry and generate the env types**

`examples/bridge-api/src/worker.offline.ts`, spec 9.2's first form beside `src/worker.ts`'s function form:

```ts
import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from './hono';
import { OfflineMeridian } from './ship/meridian';

// Built at module scope: OfflineMeridian does no I/O while it is built, which
// Workers allows in the global scope (spec 9.2). src/worker.ts builds on the
// first request, for a graph whose factories fetch.
const ship = await Nexus.create(OfflineMeridian);
export default createBridge(ship, { scopes: nodeScopes() });
```

Replace the hand-written env declaration with wrangler's generated one:

```bash
cd examples/bridge-api
git rm src/worker-env.d.ts
npx wrangler types --config wrangler.jsonc
```

`wrangler types` writes `worker-configuration.d.ts` with `Env { RELAY_URL: string }` and the `cloudflare:workers` module declaration. Add `worker-configuration.d.ts` to `tsconfig.app.json` in the form the file already lists its inputs (`files` or `include`), then run `NX_NO_CLOUD=true NX_DAEMON=false npx nx typecheck @nexusdi/bridge-api`. Expected: PASS, with `src/worker.ts` unchanged. The `test-workers` target (Step 10) runs `wrangler types --check` first, so a stale file fails.

- [ ] **Step 6: Write the harness** `examples/bridge-api/test/worker/harness.ts`

The tests build their own containers, so each can register a `trace(fn)` observer and count scope events. The worker entry itself is exercised through `SELF` in Step 6.

```ts
import type { Nexus, NexusPlugin, TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';

/** A trace plugin and the scope events it saw, in order. */
export function recorder(): {
  plugin: NexusPlugin;
  events: TraceEvent[];
  count(type: TraceEvent['type']): number;
} {
  const events: TraceEvent[] = [];
  return {
    plugin: trace((event) => {
      if (event.type.startsWith('scope:')) events.push(event);
    }),
    events,
    count: (type) => events.filter((event) => event.type === type).length,
  };
}

/** Waits until `check` holds, polling the microtask and timer queues. */
export async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export type Ship = Nexus;
```

Workers freezes `Date.now()` during synchronous execution, and it advances across `setTimeout`, so `until` terminates.

- [ ] **Step 7: Write the module-scope test** `examples/bridge-api/test/worker/module-scope.test.ts`

```ts
import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';
import offlineWorker from '../../src/worker.offline';
import { recorder } from './harness';

// Built at module scope, as src/worker.offline.ts does, with a trace plugin
// so the test counts scopes.
const seen = recorder();
const ship = await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] });
const app = createBridge(ship, { scopes: nodeScopes() });

describe('the bridge API on workerd, built at module scope', () => {
  it('answers a course with a scope per request', async () => {
    const res = await app.request('/course/Kepler-442b', {
      headers: { 'x-mission-id': 'survey-7' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      course: { to: string };
      entries: string[];
    };
    expect(body.course.to).toBe('Kepler-442b');
    expect(body.entries.every((entry) => entry.startsWith('survey-7: '))).toBe(
      true,
    );
  });

  it('gives ten concurrent requests ten scopes and disposes each', async () => {
    const created = seen.count('scope:create');
    const disposed = seen.count('scope:dispose');
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app
          .request('/course/Kepler-442b', {
            headers: { 'x-mission-id': `survey-${i}` },
          })
          .then((res) => res.text()),
      ),
    );
    expect(seen.count('scope:create') - created).toBe(10);
    expect(seen.count('scope:dispose') - disposed).toBe(10);
  });

  it('reads the request scope through nodeScopes() in a service', async () => {
    const res = await app.request('/mission', {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual({ id: 'survey-9' });
  });

  it('creates no scope for a route that resolves nothing', async () => {
    const created = seen.count('scope:create');
    expect((await app.request('/health')).status).toBe(200);
    expect(seen.count('scope:create')).toBe(created);
  });

  it('serves the module-scope entry, src/worker.offline.ts', async () => {
    const res = await offlineWorker.request('/mission', {
      headers: { 'x-mission-id': 'survey-3' },
    });
    expect(await res.json()).toEqual({ id: 'survey-3' });
  });

  it('serves the configured entry, src/worker.ts, through the function form', async () => {
    // RELAY_URL is empty in both configs, so src/worker.ts builds OfflineMeridian.
    const res = await SELF.fetch('https://bridge.test/course/Kepler-442b');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { course: { to: string } }).course.to).toBe(
      'Kepler-442b',
    );
  });
});
```

- [ ] **Step 8: Write the function-form test** `examples/bridge-api/test/worker/function-form.test.ts`

The test overrides `NAV_CHARTS` with a factory that fetches the relay before it returns the offline charts, so the build does I/O. It stubs `globalThis.fetch`, which keeps the leg off the network and lets the test decide when the fetch fails. Part D's relay (`e2e/relay.ts`) is a `node:http` server and cannot run inside workerd.

```ts
import { Nexus } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridge } from '../../src/hono';
import { NAV_CHARTS, type INavCharts } from '../../src/ship/contracts';
import { DEFAULT_RELAY_URL, OfflineMeridian } from '../../src/ship/meridian';

// The charts the fetching factory returns once its download succeeds.
const offline = await Nexus.create(OfflineMeridian);
const charts: INavCharts = offline.get(NAV_CHARTS);

/** The function form over a graph whose NAV_CHARTS factory fetches. */
function fetchingShip() {
  return () =>
    createTestingContainer(OfflineMeridian)
      .override(NAV_CHARTS, {
        useFactory: async (): Promise<INavCharts> => {
          const res = await fetch(DEFAULT_RELAY_URL);
          if (!res.ok) throw new Error(`relay answered ${res.status}`);
          return charts;
        },
        deps: [],
      })
      .create();
}

const relayOk = () =>
  new Response('{}', { headers: { 'content-type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('the function form on workerd', () => {
  it('builds once on the first request and serves every later one', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => relayOk());
    const build = vi.fn(fetchingShip());
    const app = createBridge(build);
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => app.request('/course/Kepler-442b')),
    );
    expect(replies.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(((await replies[0]!.json()) as { course: unknown }).course).toEqual(
      charts.plot('Kepler-442b'),
    );
    expect(build).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('answers 503 to every request that awaited a cancelled build, then retries', async () => {
    // The first client aborts mid-build: workerd cancels the fetch that
    // belongs to its request, and the shared build rejects (spec 9.2).
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(
        new DOMException('The operation was aborted.', 'AbortError'),
      )
      .mockImplementation(async () => relayOk());
    const build = vi.fn(fetchingShip());
    const app = createBridge(build);

    const first = await Promise.all([
      app.request('/course/Kepler-442b'),
      app.request('/course/Kepler-442b'),
    ]);
    expect(first.map((r) => r.status)).toEqual([503, 503]);
    for (const res of first) expect(await res.text()).toBe('');

    const retry = await app.request('/course/Kepler-442b');
    expect(retry.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 9: Write the disposal test** `examples/bridge-api/test/worker/disposal.test.ts`

```ts
import { Nexus } from '@nexusdi/core';
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';
import { recorder, until } from './harness';

describe('scope disposal on workerd', () => {
  it('hands the disposal to waitUntil, so it finishes after the response', async () => {
    const seen = recorder();
    const app = createBridge(
      await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] }),
    );
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request('https://bridge.test/course/Kepler-442b'),
      env,
      ctx,
    );
    await res.text();
    await waitOnExecutionContext(ctx);
    expect(seen.count('scope:create')).toBe(1);
    expect(seen.count('scope:dispose')).toBe(1);
  });

  it('disposes a streaming response when the client aborts', async () => {
    const seen = recorder();
    const app = createBridge(
      await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] }),
    );
    const controller = new AbortController();
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request('https://bridge.test/log/stream', {
        signal: controller.signal,
      }),
      env,
      ctx,
    );
    const reader = res.body!.getReader();
    await reader.read(); // the first entry: the scope is open
    expect(seen.count('scope:dispose')).toBe(0);

    controller.abort();
    if (env.SIGNAL === 'off') await reader.cancel(); // without the flag only the wrapper sees it
    await until(() => seen.count('scope:dispose') === 1);
    await waitOnExecutionContext(ctx);
    expect(seen.count('scope:create')).toBe(1);
  });
});
```

`GET /log/stream` is Task 18's `streamSSE` route: 3 entries, one per 50 ms (`data: <mission>: tick N`). The test aborts after the first, while 100 ms of stream remain. Under `SIGNAL=off` the test cancels the reader, which is what workerd does to a body whose client left; the run with the flag shows that `request.signal` alone disposes. The leg's log records both outcomes for `/runtimes/` (Task 26).

- [ ] **Step 10: Add the target** to `examples/bridge-api/package.json` under `nx.targets`

```json
"test-workers": {
  "executor": "nx:run-commands",
  "options": {
    "cwd": "examples/bridge-api",
    "commands": [
      "wrangler types --config wrangler.jsonc --check",
      "vitest run --config vitest.workers.config.ts",
      "SIGNAL=off vitest run --config vitest.workers.config.ts"
    ],
    "parallel": false
  }
}
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:test-workers`
Expected: PASS, the types check, then two runs of 10 tests.

- [ ] **Step 11: Add the job** to `.github/workflows/ci.yml`, after `types-floor`

```yaml
# The bridge API's suite on each edge runtime the integrations spec names
# (spec 9.8). One leg per runtime, so a red leg names the runtime. Runs on
# every push and pull request with no path filter, so the rulesets can
# require it. No step runs `nx run-many`: release-verify-gate holds the one
# gate step in this file.
adapter-runtimes:
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      leg: [workerd]
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        filter: tree:0

    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version-file: .nvmrc
        cache: 'npm'

    - run: npm ci

    - name: workerd
      if: matrix.leg == 'workerd'
      run: npx nx run @nexusdi/bridge-api:test-workers
```

- [ ] **Step 12: Run the checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-runtimes-workflow release-verify-gate` then `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/bridge-api @nexusdi/repo-checks` and `npx prettier --check .`
Expected: PASS. actionlint runs in CI's `workflows` job; run it locally with `npx --yes actionlint@1.7.12 2>/dev/null || true` only if the binary is available, and rely on CI otherwise.

- [ ] **Step 13: Commit**

```bash
git add -A examples/bridge-api
git add tools/repo-checks/src/adapter-runtimes-workflow.test.ts .github/workflows/ci.yml package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "ci(bridge-api): run the bridge api on workerd

The adapter-runtimes job gets its first leg. The suite builds the
container at module scope and through the function form, answers 503 to
every request that awaited a cancelled build, retries on the next, and
checks disposal through waitUntil and on a client abort, with and
without enable_request_signal.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: adapter-runtimes, the Deno, Bun and edge-runtime legs

Spec 9.1, 9.4 and 9.8. Deno and Bun run a bundled smoke server that holds the same route assertions as the Node suite. The edge-runtime leg runs the routes inside Vitest's `edge-runtime` environment.

Files:

- Create: `examples/bridge-api/test/runtime/smoke.ts`, `examples/bridge-api/test/runtime/checks.ts`, `examples/bridge-api/scripts/runtime-leg.mjs`, `examples/bridge-api/vitest.edge.config.ts`, `examples/bridge-api/test/edge/routes.edge.test.ts`
- Modify: `examples/bridge-api/package.json` (targets `runtime-leg` and `test-edge`, dev dependency `@edge-runtime/vm`), `.github/workflows/ci.yml` (legs `deno`, `bun`, `edge-runtime`), `tools/repo-checks/src/adapter-runtimes-workflow.test.ts`

Interfaces:

- Consumes (Task 18): `createBridge` from `src/hono.ts`, `OfflineMeridian` from `src/ship/meridian.ts`; the routes listed in Task 21's Interfaces. The Node suite stays `e2e/bridge.e2e.ts` (target `@nexusdi/bridge-api:e2e`). Deno and Bun do not run Vitest's `describe.each` over `e2e/servers.ts`, so `runChecks` repeats its route assertions.
- Consumes (Task 21): the `adapter-runtimes` job.
- Produces: `runChecks(base: string): Promise<string[]>` in `test/runtime/checks.ts` (failures as strings, empty on success).

- [ ] **Step 1: Extend the workflow check** in `tools/repo-checks/src/adapter-runtimes-workflow.test.ts`

```ts
it('runs Deno, Bun and edge-runtime legs, with versions from toolchains.json', () => {
  expect(job.strategy?.matrix?.leg).toEqual([
    'workerd',
    'deno',
    'bun',
    'edge-runtime',
  ]);
  const runs = job.steps.map((s) => s.run ?? '').join('\n');
  expect(runs).toContain('nx run @nexusdi/bridge-api:runtime-leg --leg=deno');
  expect(runs).toContain('nx run @nexusdi/bridge-api:runtime-leg --leg=bun');
  expect(runs).toContain('nx run @nexusdi/bridge-api:test-edge');
  // The script reads the pinned versions; the workflow names none.
  expect(runs).not.toMatch(/deno@\d|bun@\d/);
});
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-runtimes-workflow`
Expected: FAIL on the leg list.

- [ ] **Step 2: Write the shared checks** `examples/bridge-api/test/runtime/checks.ts`

```ts
/**
 * The route assertions every non-Vitest runtime leg runs (spec 9.8). Each
 * returns failures as text, so Deno and Bun need no test runner.
 */
export async function runChecks(base: string): Promise<string[]> {
  const failures: string[] = [];
  const expectEqual = (what: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      failures.push(
        `${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
      );
  };

  const course = await fetch(`${base}/course/Kepler-442b`, {
    headers: { 'x-mission-id': 'survey-7' },
  });
  expectEqual('course status', course.status, 200);
  expectEqual(
    'course body',
    ((await course.json()) as { course: { to: string } }).course.to,
    'Kepler-442b',
  );

  const missions = await Promise.all(
    ['survey-1', 'survey-2', 'survey-3'].map((id) =>
      fetch(`${base}/mission`, { headers: { 'x-mission-id': id } }).then(
        (res) => res.json() as Promise<{ id: string }>,
      ),
    ),
  );
  expectEqual(
    'ambient scope per request',
    missions.map((m) => m.id),
    ['survey-1', 'survey-2', 'survey-3'],
  );

  const missing = await fetch(`${base}/course/Uncharted`, {
    headers: { 'x-mission-id': 'missing-provider' },
  });
  expectEqual('missing provider status', missing.status, 500);
  expectEqual('missing provider body', await missing.text(), '');

  const health = await fetch(`${base}/health`);
  expectEqual('health status', health.status, 200);

  return failures;
}
```

`x-mission-id: missing-provider` makes Task 18's `/course/:to` resolve an unbound token, and the adapter answers 500 with an empty body.

- [ ] **Step 3: Write the smoke server** `examples/bridge-api/test/runtime/smoke.ts`

```ts
import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';
import { runChecks } from './checks';

declare const Deno:
  | {
      serve(
        o: { port: number; onListen(a: { port: number }): void },
        h: (r: Request) => Response | Promise<Response>,
      ): { shutdown(): Promise<void> };
    }
  | undefined;
declare const Bun:
  | {
      serve(o: {
        port: number;
        fetch: (r: Request) => Response | Promise<Response>;
      }): { port: number; stop(force?: boolean): void };
    }
  | undefined;

const ship = await Nexus.create(OfflineMeridian);
const app = createBridge(ship, { scopes: nodeScopes() });

let base: string;
let stop: () => Promise<void>;
if (typeof Deno !== 'undefined') {
  const port = await new Promise<number>((resolve) => {
    const server = Deno.serve(
      { port: 0, onListen: ({ port }) => resolve(port) },
      app.fetch,
    );
    stop = () => server.shutdown();
  });
  base = `http://127.0.0.1:${port}`;
} else if (typeof Bun !== 'undefined') {
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://127.0.0.1:${server.port}`;
  stop = async () => server.stop(true);
} else {
  throw new Error('smoke.ts runs under Deno or Bun');
}

const failures = await runChecks(base);
await stop!();
await ship[Symbol.asyncDispose]();
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  failures.length === 0
    ? 'PASS bridge-api runtime checks'
    : `${failures.length} failure(s)`,
);
if (failures.length > 0) throw new Error('runtime checks failed');
```

- [ ] **Step 4: Write the leg runner** `examples/bridge-api/scripts/runtime-leg.mjs`

```js
#!/usr/bin/env node
/**
 * Bundles test/runtime/smoke.ts to one ESM file and runs it with the Deno or
 * Bun version pinned in examples/toolchain-matrix/toolchains.json, so this
 * leg and the toolchain matrix test one version of each runtime (spec 9.1).
 * The bundle keeps node:async_hooks external: each runtime resolves it.
 *
 *   node scripts/runtime-leg.mjs --leg=deno|bun
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { leg: { type: 'string' } } });
const leg = values.leg;
if (leg !== 'deno' && leg !== 'bun') throw new Error('--leg=deno or --leg=bun');

const here = resolve(import.meta.dirname, '..');
const root = resolve(here, '../..');
const toolchains = JSON.parse(
  readFileSync(join(root, 'examples/toolchain-matrix/toolchains.json'), 'utf8'),
).toolchains;
const version = toolchains.find((t) => t.id === leg)?.version;
if (!version) throw new Error(`toolchains.json pins no ${leg}`);

const outfile = join(here, 'dist/runtime/smoke.mjs');
await build({
  entryPoints: [join(here, 'test/runtime/smoke.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['node:async_hooks'],
  conditions: ['@nexusdi/source'],
  mainFields: ['module', 'main'],
  outfile,
  logLevel: 'warning',
});

const args =
  leg === 'deno'
    ? [
        '--yes',
        `deno@${version}`,
        'run',
        '--allow-net',
        '--allow-read',
        outfile,
      ]
    : ['--yes', `bun@${version}`, outfile];
console.log(`Running the bridge API checks on ${leg} ${version}`);
execFileSync('npx', args, { stdio: 'inherit', cwd: here });
```

`target: 'es2022'` lowers `await using` in core's source, which Deno 2.9 and Bun 1.4 parse anyway; the lowering keeps the bundle identical on both.

- [ ] **Step 5: Write the edge-runtime config and test**

```bash
npm install --workspace @nexusdi/bridge-api --save-dev --save-exact @edge-runtime/vm@$(npm view @edge-runtime/vm version)
```

`examples/bridge-api/vitest.edge.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Vercel's Edge Runtime globals through @edge-runtime/vm (spec 9.8). The
// environment swaps the globals; module resolution stays Vite's, so this leg
// shows the app runs on the Edge Runtime's Web APIs, not that Vercel's
// bundler accepts node:async_hooks. /runtimes/ says so.
export default defineConfig({
  test: {
    name: '@nexusdi/bridge-api:edge-runtime',
    environment: 'edge-runtime',
    include: ['test/edge/**/*.edge.test.ts'],
  },
});
```

`examples/bridge-api/test/edge/routes.edge.test.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect, it } from 'vitest';

import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';

describe('the bridge API in the Edge Runtime VM', () => {
  it('runs in the Edge Runtime', () => {
    expect(typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime).toBe(
      'string',
    );
  });

  it('answers a course and reads the ambient scope', async () => {
    await using ship = await Nexus.create(OfflineMeridian);
    const app = createBridge(ship, { scopes: nodeScopes() });
    const course = await app.request('/course/Kepler-442b');
    expect(course.status).toBe(200);
    expect(
      ((await course.json()) as { course: { to: string } }).course.to,
    ).toBe('Kepler-442b');
    const mission = await app.request('/mission', {
      headers: { 'x-mission-id': 'survey-4' },
    });
    expect(await mission.json()).toEqual({ id: 'survey-4' });
  });
});
```

- [ ] **Step 6: Add the targets** to `examples/bridge-api/package.json` under `nx.targets`

```json
"runtime-leg": {
  "executor": "nx:run-commands",
  "options": {
    "cwd": "examples/bridge-api",
    "command": "node scripts/runtime-leg.mjs --leg={args.leg}"
  }
},
"test-edge": {
  "executor": "nx:run-commands",
  "options": {
    "cwd": "examples/bridge-api",
    "command": "vitest run --config vitest.edge.config.ts"
  }
}
```

Run each: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:runtime-leg --leg=deno`, `... --leg=bun`, `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/bridge-api:test-edge`
Expected: `PASS bridge-api runtime checks` twice, and 2 Vitest tests passing.

- [ ] **Step 7: Extend the job** in `.github/workflows/ci.yml`

Replace the matrix line and append the steps:

```yaml
strategy:
  fail-fast: false
  matrix:
    leg: [workerd, deno, bun, edge-runtime]
```

```yaml
- name: Deno
  if: matrix.leg == 'deno'
  run: npx nx run @nexusdi/bridge-api:runtime-leg --leg=deno

- name: Bun
  if: matrix.leg == 'bun'
  run: npx nx run @nexusdi/bridge-api:runtime-leg --leg=bun

- name: Edge Runtime VM
  if: matrix.leg == 'edge-runtime'
  run: npx nx run @nexusdi/bridge-api:test-edge
```

- [ ] **Step 8: Run the checks**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-runtimes-workflow` then `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/bridge-api @nexusdi/repo-checks` and `npx prettier --check .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add examples/bridge-api tools/repo-checks/src/adapter-runtimes-workflow.test.ts .github/workflows/ci.yml package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "ci(bridge-api): run the bridge api on deno, bun and the edge runtime

Deno and Bun run a bundled smoke server at the versions toolchains.json
pins, with the same route checks as the node suite, the ambient scope
included. The edge-runtime leg runs the routes in Vercel's Edge Runtime
globals.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: adapter-peers and node-floor

Spec 13.4. One leg per supported framework line, each installing that line over the workspace with `--no-save` and running the adapter's own tests. A second job, `node-floor`, runs every published lib's tests on the Node its `engines` field promises.

Files:

- Create: `scripts/adapter-peers.mjs`, `scripts/adapter-peers.json`, `tools/repo-checks/src/adapter-peers.test.ts`, `tools/repo-checks/src/node-floor.test.ts`
- Modify: `.github/workflows/ci.yml` (jobs `adapter-peers` and `node-floor`)

Interfaces:

- Consumes: the projects `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/react-router`, `@nexusdi/vitest`, `@nexusdi/next`, each with a `test` target that includes its e2e file (Tasks 3, 6, 8, 10, 4, 17); `@nexusdi/react` with its `test` target (unit and SSR suites) and its `e2e` target (Tasks 11 to 15); `@nexusdi/next-bridge:e2e` (Task 16).
- Produces: `scripts/adapter-peers.json`, the leg list that the workflow and the check read.

- [ ] **Step 1: Write the leg list** `scripts/adapter-peers.json`

```json
{
  "hono-floor": {
    "install": ["hono@4.0.0"],
    "targets": ["@nexusdi/hono:test"]
  },
  "hono-latest": { "install": ["hono@^4"], "targets": ["@nexusdi/hono:test"] },
  "express-floor": {
    "install": ["express@5.0.0"],
    "targets": ["@nexusdi/express:test"]
  },
  "express-latest": {
    "install": ["express@^5"],
    "targets": ["@nexusdi/express:test"]
  },
  "fastify-floor": {
    "install": ["fastify@5.0.0", "fastify-plugin@6.0.0"],
    "targets": ["@nexusdi/fastify:test"]
  },
  "fastify-latest": {
    "install": ["fastify@^5", "fastify-plugin@^6"],
    "targets": ["@nexusdi/fastify:test"]
  },
  "react-router-7-floor": {
    "install": [
      "react-router@7.9.0",
      "@react-router/node@7.9.0",
      "@react-router/serve@7.9.0",
      "@react-router/dev@7.9.0"
    ],
    "env": { "REACT_ROUTER_V8_MIDDLEWARE": "1" },
    "targets": ["@nexusdi/react-router:test"]
  },
  "react-router-7-latest": {
    "install": [
      "react-router@^7",
      "@react-router/node@^7",
      "@react-router/serve@^7",
      "@react-router/dev@^7"
    ],
    "env": { "REACT_ROUTER_V8_MIDDLEWARE": "1" },
    "targets": ["@nexusdi/react-router:test"]
  },
  "react-router-8-latest": {
    "install": [
      "react-router@^8",
      "@react-router/node@^8",
      "@react-router/serve@^8",
      "@react-router/dev@^8"
    ],
    "targets": ["@nexusdi/react-router:test"]
  },
  "react-floor": {
    "install": [
      "react@19.0.0",
      "react-dom@19.0.0",
      "@types/react@19.0.0",
      "@types/react-dom@19.0.0"
    ],
    "targets": ["@nexusdi/react:test", "@nexusdi/react:e2e"]
  },
  "react-19-latest": {
    "install": [
      "react@^19",
      "react-dom@^19",
      "@types/react@^19",
      "@types/react-dom@^19"
    ],
    "targets": ["@nexusdi/react:test", "@nexusdi/react:e2e"]
  },
  "vitest-floor": {
    "install": ["vitest@4.1.0"],
    "targets": ["@nexusdi/vitest:test"]
  },
  "vitest-4-latest": {
    "install": ["vitest@^4"],
    "targets": ["@nexusdi/vitest:test"]
  },
  "vitest-5-latest": {
    "install": ["vitest@^5"],
    "targets": ["@nexusdi/vitest:test"]
  },
  "next-floor": {
    "install": ["next@15.1.0"],
    "targets": ["@nexusdi/next:test", "@nexusdi/next-bridge:e2e"]
  },
  "next-15-latest": {
    "install": ["next@^15"],
    "targets": ["@nexusdi/next:test", "@nexusdi/next-bridge:e2e"]
  },
  "next-16-latest": {
    "install": ["next@^16"],
    "targets": ["@nexusdi/next:test", "@nexusdi/next-bridge:e2e"]
  }
}
```

`REACT_ROUTER_V8_MIDDLEWARE` is the switch Task 10's fixture `libs/react-router/test-fixtures/app/react-router.config.ts` reads to set `future.v8_middleware: true` on a 7.x install (spec 7.7).

- [ ] **Step 2: Write the failing check** `tools/repo-checks/src/adapter-peers.test.ts`

```ts
import { workspaceRoot } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf-8');
const legs = JSON.parse(read('scripts/adapter-peers.json')) as Record<
  string,
  { install: string[]; targets: string[] }
>;
const ci = parse(read('.github/workflows/ci.yml')) as {
  jobs: Record<
    string,
    { strategy?: { matrix?: { leg?: string[] } }; steps: { run?: string }[] }
  >;
};

/** The floor of each peer range, as the adapter's package.json states it. */
function peerFloor(dir: string, peer: string): string {
  const pkg = JSON.parse(read(`libs/${dir}/package.json`)) as {
    peerDependencies: Record<string, string>;
  };
  const range = pkg.peerDependencies[peer];
  const floor = /\^(\d+\.\d+\.\d+)/.exec(range ?? '')?.[1];
  if (!floor) throw new Error(`libs/${dir} has no caret ${peer} peer`);
  return floor;
}

describe('adapter-peers', () => {
  it('runs every leg of scripts/adapter-peers.json in the workflow matrix', () => {
    expect(ci.jobs['adapter-peers']?.strategy?.matrix?.leg).toEqual(
      Object.keys(legs),
    );
    const runs = ci.jobs['adapter-peers']!.steps.map((s) => s.run ?? '').join(
      '\n',
    );
    expect(runs).toContain('node scripts/adapter-peers.mjs "$LEG"');
    expect(runs).not.toContain('nx run-many');
  });

  it.each([
    ['hono', 'hono', 'hono-floor'],
    ['express', 'express', 'express-floor'],
    ['fastify', 'fastify', 'fastify-floor'],
    ['react-router', 'react-router', 'react-router-7-floor'],
    ['react', 'react', 'react-floor'],
    ['vitest', 'vitest', 'vitest-floor'],
    ['next', 'next', 'next-floor'],
  ])("tests the floor of the %s adapter's %s peer", (dir, peer, leg) => {
    expect(legs[leg]?.install).toContain(`${peer}@${peerFloor(dir, peer)}`);
  });
});
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-peers`
Expected: FAIL, `ENOENT ... scripts/adapter-peers.json` before Step 1 is saved, then FAIL on the missing job.

- [ ] **Step 3: Write the runner** `scripts/adapter-peers.mjs`

```js
#!/usr/bin/env node
/**
 * Installs one leg's framework versions over the workspace with --no-save,
 * then runs that leg's targets with `nx run`, one at a time, skipping the
 * Nx cache: the cache key does not see the installed version (spec 13.4).
 *
 *   node scripts/adapter-peers.mjs <leg>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const legs = JSON.parse(
  readFileSync(join(ROOT, 'scripts/adapter-peers.json'), 'utf8'),
);
const name = process.argv[2];
const leg = legs[name];
if (!leg)
  throw new Error(
    `unknown leg ${name}; one of ${Object.keys(legs).join(', ')}`,
  );

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NX_NO_CLOUD: 'true', NX_DAEMON: 'false', ...env },
  });

console.log(`Leg ${name}: installing ${leg.install.join(' ')}`);
run('npm', ['install', '--no-save', '--no-audit', '--no-fund', ...leg.install]);
for (const spec of leg.install) {
  const pkg = spec.slice(0, spec.lastIndexOf('@'));
  const { version } = JSON.parse(
    readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8'),
  );
  console.log(`  ${pkg} ${version}`);
}
for (const target of leg.targets) {
  run('npx', ['nx', 'run', target, '--skip-nx-cache'], leg.env ?? {});
}
```

- [ ] **Step 4: Add the job** to `.github/workflows/ci.yml`, after `adapter-runtimes`

```yaml
# Each adapter's tests against the floor and the newest release of every
# framework line its peer range admits (integrations spec 13.4). The leg
# list lives in scripts/adapter-peers.json; adapter-peers.test.ts holds
# this matrix to it and each floor to the adapter's peer range.
adapter-peers:
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      leg:
        - hono-floor
        - hono-latest
        - express-floor
        - express-latest
        - fastify-floor
        - fastify-latest
        - react-router-7-floor
        - react-router-7-latest
        - react-router-8-latest
        - react-floor
        - react-19-latest
        - vitest-floor
        - vitest-4-latest
        - vitest-5-latest
        - next-floor
        - next-15-latest
        - next-16-latest
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        filter: tree:0

    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version-file: .nvmrc
        cache: 'npm'

    - run: npm ci

    - name: Run the leg
      env:
        LEG: ${{ matrix.leg }}
      run: node scripts/adapter-peers.mjs "$LEG"
```

- [ ] **Step 5: Add the `node-floor` job** (CI policy ruling, 2026-10-15)

Every published lib declares `engines.node: ">=22.12"`, and only `@nexusdi/cli` runs its tests there (`cli-node-floor`). `node-floor` closes that gap for the rest. It follows `cli-node-floor`: install and build on the `.nvmrc` Node, then put the floor Node first on `PATH` and run `vitest` directly in the lib, because `nx run` would rebuild the project graph on the floor Node. `@nexusdi/react-router` runs on 22.22.0, the floor React Router 8 declares. `@nexusdi/cli` keeps its own job.

Write the check first, `tools/repo-checks/src/node-floor.test.ts`: the matrix `lib` list equals every folder under `libs/` whose `package.json` is not private, minus `cli`, in folder order; each entry's `node` equals the floor of that lib's `engines.node` (22.12.0), except `react-router` at 22.22.0; and no step runs `nx run-many`. Run it and see it fail on the missing job.

```yaml
# Every published lib promises Node 22.12 in engines, and the other jobs run
# the .nvmrc Node. This runs each lib's tests on its floor. Install and build
# run on .nvmrc, as in cli-node-floor: the npm that ships with 22.12 reads the
# lockfile's optional platform packages as missing. vitest runs directly,
# because nx run would rebuild the project graph on the floor Node.
node-floor:
  runs-on: ubuntu-latest
  strategy:
    fail-fast: false
    matrix:
      include:
        - { lib: core, node: 22.12.0 }
        - { lib: decorators, node: 22.12.0 }
        - { lib: devtools, node: 22.12.0 }
        - { lib: errors, node: 22.12.0 }
        - { lib: express, node: 22.12.0 }
        - { lib: fastify, node: 22.12.0 }
        - { lib: federation, node: 22.12.0 }
        - { lib: hono, node: 22.12.0 }
        - { lib: interceptors, node: 22.12.0 }
        - { lib: next, node: 22.12.0 }
        - { lib: node, node: 22.12.0 }
        - { lib: react, node: 22.12.0 }
        - { lib: react-router, node: 22.22.0 }
        - { lib: testing, node: 22.12.0 }
        - { lib: vitest, node: 22.12.0 }
  steps:
    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        filter: tree:0

    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version-file: .nvmrc
        cache: 'npm'

    - run: npm ci

    - env:
        LIB: ${{ matrix.lib }}
      run: npx nx run "@nexusdi/$LIB:build"

    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: ${{ matrix.node }}

    - run: node --version && npx vitest run --configLoader runner
      working-directory: libs/${{ matrix.lib }}
```

Seven of the 15 legs start red on Node 22.12 without three changes, which this step makes before the job lands:

- Lower the doctest modules to the floor: `@nexusdi/doc-examples` runs an oxc transform with a target of node22.12 over each transformed `.md` module, after `moduleFences`, and returns its source map, so a README fence that uses syntax 22.12 lacks (such as `using`), in a doctest fence or a module fence, is lowered before it runs. Lowering `using` imports helpers from `@oxc-project/runtime`, so the step adds it as an exact-pinned root dev dependency at the oxc version rolldown uses.
- Core's tests check a disposal error by `error.name === 'SuppressedError'` and its `error` and `suppressed` fields, in place of `toBeInstanceOf(SuppressedError)`. Node 22.12 has no global `SuppressedError`, and core throws its own `NexusSuppressedError` there (`runtime/dispose.ts`).
- `libs/core/src/blueprint/visibility.oracle.test.ts` gets an explicit timeout. Its 600-graph case takes 8.8 s under load against the 5 s default.

Run all 15 legs locally on their floor Node before the job lands in CI, and record each result in the ledger. The `node-floor` job lands in the same commit as the lowering step, never before it, and until then no new README or docs fence uses `await using`; the lowering step makes the existing ones pass (ruling of 2026-10-15).

Try `--configLoader runner` first. Each lib's `vite.config.ts` imports `@nexusdi/doc-examples` through its `.ts` source, which Node 22.12 cannot load with the default bundle loader (`ERR_UNKNOWN_FILE_EXTENSION`, seen on Task 3). If the runner loader cannot load it either, drop the flag and set `NODE_OPTIONS: --experimental-strip-types` on that step only, with the comment `# Node 22.12 strips types only behind this flag, and vite.config.ts imports @nexusdi/doc-examples as .ts.` Libraries added after this task are added to the matrix by the task that creates them; the check fails until they are.

- [ ] **Step 6: Run the checks and two legs locally**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- adapter-peers node-floor release-verify-gate`
Expected: PASS.
Run: `node scripts/adapter-peers.mjs hono-floor && node scripts/adapter-peers.mjs fastify-floor && npm ci`
Expected: both legs PASS. The final `npm ci` restores the workspace versions. A floor that fails is a spec finding: raise the floor in that adapter's `peerDependencies`, in the spec's section of that adapter, and in this leg, in one commit.

Run, for each of the 15 legs: `cd libs/<lib> && PATH=<floor node bin>:$PATH npx vitest run --configLoader runner`
Expected: PASS on every leg, which confirms the loader choice and the three changes of Step 5 before CI runs them. `--configLoader runner` loads the express and vitest configs on 22.12.0 with no strip-types flag (checked on Task 4).

- [ ] **Step 7: Commit**

```bash
git add scripts/adapter-peers.mjs scripts/adapter-peers.json tools/repo-checks/src/adapter-peers.test.ts tools/repo-checks/src/node-floor.test.ts .github/workflows/ci.yml
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "ci(repo): test each adapter against its framework floor and newest lines

adapter-peers installs one framework line per leg over the workspace and
runs the adapter's tests. The react legs run its e2e suite, and the next
legs run the demo's e2e. A check holds
the matrix to the leg list and each floor leg to the peer range.

node-floor runs every published lib's tests on the Node its engines field
promises, 22.22 for react-router.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: size fixtures, packaging and the type floor

Spec 9.6, 13.1, 13.2 and 13.6.

Files:

- Create: `examples/size/src/express.ts`, `examples/size/src/fastify.ts`, `examples/size/src/hono.ts`, `examples/size/src/react-router.ts`, `examples/size/src/next.ts`, `examples/size/src/hono-worker.ts`, `examples/size/fixtures.json`, `libs/{express,fastify,hono,react-router,vitest,react,next}/tsconfig.floor.json`
- Modify: `scripts/size-report.mjs`, `scripts/size-compare.mjs`, `tools/repo-checks/src/size-report.test.ts`, `examples/size/package.json`, `scripts/verify-packaging.mjs`, `scripts/check-type-floor.mjs`

Interfaces:

- Consumes: every adapter's public entry (header table).
- Produces: `gzipOf(fixture, root, file, options?: { external?: string[]; platform?: 'node' | 'neutral' })`; `size-report.mjs` output gains `standalone: Record<string, number | null>`.

- [ ] **Step 1: Write the failing size tests** in `tools/repo-checks/src/size-report.test.ts`

Append:

```ts
describe('fixtures.json options', () => {
  it('keeps a framework external, so the figure is the adapter plus core', async () => {
    const fixture = await tmpFixture({
      'core.ts': "import { Nexus } from '@nexusdi/core'; console.log(Nexus);",
      'hono.ts':
        "import { Hono } from 'hono'; import { Nexus } from '@nexusdi/core'; console.log(Hono, Nexus);",
      'fixtures.json': JSON.stringify({ hono: { external: ['hono'] } }),
    });
    const core = await gzipOf(fixture, workspaceRoot, 'core.ts');
    const packages = await measurePackages(
      fixture,
      workspaceRoot,
      ['hono'],
      core,
      false,
    );
    expect(packages['hono']).toBeLessThan(200); // the import line, not Hono's ~7.7 KB
  });

  it('reports a standalone fixture at its full size under its own name', async () => {
    const fixture = await tmpFixture({
      'core.ts': "import { Nexus } from '@nexusdi/core'; console.log(Nexus);",
      'hono-worker.ts':
        "import { Hono } from 'hono'; export default new Hono();",
      'fixtures.json': JSON.stringify({
        'hono-worker': { standalone: true, platform: 'neutral' },
      }),
    });
    const standalone = await measureStandalone(fixture, workspaceRoot, false);
    expect(standalone['hono-worker']).toBeGreaterThan(5000);
  });
});
```

`tmpFixture` is the helper this file already uses for its fixtures; if the file builds fixtures inline instead, add:

```ts
async function tmpFixture(files: Record<string, string>): Promise<string> {
  const dir = mkdtempSync(join(workspaceRoot, 'node_modules', '.size-test-'));
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(dir, name), text);
  return dir;
}
```

with `mkdtempSync` and `writeFileSync` from `node:fs`, and import `measureStandalone` from `../../../scripts/size-report.mjs` beside the existing imports.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- size-report`
Expected: FAIL, `measureStandalone is not a function`.

- [ ] **Step 2: Implement the options** in `scripts/size-report.mjs`

Replace `gzipOf`, `measure` and `measurePackages`, and add `fixtureOptions` and `measureStandalone`:

```js
/** Per-fixture options from examples/size/fixtures.json, keyed by fixture name. */
export function fixtureOptions(fixture) {
  const file = join(fixture, 'fixtures.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

export async function gzipOf(fixture, root, file, options = {}) {
  const result = await build({
    entryPoints: [join(fixture, file)],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: options.platform ?? 'node',
    target: 'es2022',
    external: options.external ?? [],
    write: false,
    absWorkingDir: root,
    logLevel: 'silent',
  });
  return gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
}

export async function measure(fixture, root, file, swallow, options) {
  try {
    return await gzipOf(fixture, root, file, options);
  } catch (err) {
    if (swallow) return null;
    throw err;
  }
}

// A framework adapter marks its framework external in fixtures.json, so its
// figure is the adapter's own weight (spec 13.6).
export async function measurePackages(fixture, root, libs, core, swallow) {
  const options = fixtureOptions(fixture);
  const packages = {};
  for (const dir of libs) {
    for (const [name, file] of [
      [dir, `${dir}.ts`],
      [`${dir}/text`, `${dir}-text.ts`],
    ]) {
      if (name === 'core' || !existsSync(join(fixture, file))) continue;
      const size = await measure(fixture, root, file, swallow, options[name]);
      packages[name] = size === null || core === null ? null : size - core;
    }
  }
  return packages;
}

// A standalone fixture, such as hono-worker, is a whole deployable: reported
// at its full size, framework included (spec 9.6).
export async function measureStandalone(fixture, root, swallow) {
  const standalone = {};
  for (const [name, options] of Object.entries(fixtureOptions(fixture))) {
    if (!options.standalone) continue;
    standalone[name] = await measure(
      fixture,
      root,
      `${name}.ts`,
      swallow,
      options,
    );
  }
  return standalone;
}
```

In `main()`, after `const packages = ...`:

```js
const standalone = await measureStandalone(fixture, ROOT, swallow);
const sizes = { core, packages, standalone };
```

In `scripts/size-compare.mjs` `compareSizes`, append rows after the package rows:

```js
    ...Object.keys(head.standalone ?? {})
      .sort()
      .map((name) => {
        const was = base.standalone?.[name];
        const now = head.standalone[name];
        if (was === undefined) return `| ${name} (whole bundle) | new | ${now ?? 'no figure'} | | |`;
        if (was === null || now === null)
          return `| ${name} (whole bundle) | no figure | ${now ?? 'no figure'} | | |`;
        return `| ${name} (whole bundle) | ${was} | ${now} | ${bytes(was, now)} | ${pct(was, now)} |`;
      }),
```

- [ ] **Step 3: Write the fixtures**

`examples/size/fixtures.json`:

```json
{
  "express": { "external": ["express"] },
  "fastify": { "external": ["fastify", "fastify-plugin"] },
  "hono": { "external": ["hono"] },
  "react-router": { "external": ["react-router"] },
  "next": { "external": ["next", "next/server", "next/headers"] },
  "hono-worker": {
    "standalone": true,
    "platform": "neutral",
    "external": ["node:async_hooks"]
  }
}
```

`examples/size/src/hono.ts`:

```ts
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

import { App, UserService } from './app.ts';
import { Nexus } from '@nexusdi/core';

const di = nexus(await Nexus.create(App));
export default new Hono().use(di.middleware).get(
  '/',
  di.inject({ users: UserService }, ({ users }, c) => c.text(String(users))),
);
```

`examples/size/src/express.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
const app = express();
app.use(di.middleware);
app.get(
  '/',
  di.inject(
    { users: UserService },
    ({ users }, _req, res) => void res.send(String(users)),
  ),
);
export default app;
```

`examples/size/src/fastify.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
const app = Fastify();
await app.register(di.plugin);
app.get(
  '/',
  di.inject({ users: UserService }, ({ users }) => String(users)),
);
export default app;
```

`examples/size/src/react-router.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App));
export const middleware = [di.middleware];
export const loader = di.inject({ users: UserService }, ({ users }) => ({
  users: String(users),
}));
```

`examples/size/src/next.ts`:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/next';

import { App, UserService } from './app.ts';

const di = nexus(() => Nexus.create(App));
export const GET = di.route(
  { users: UserService },
  ({ users }) => new Response(String(users)),
);
```

`examples/size/src/hono-worker.ts`, the Workers entry of spec 9.2 at its smallest:

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';

import { App, UserService } from './app.ts';

const di = nexus(await Nexus.create(App), { scopes: nodeScopes() });
export default new Hono().use(di.middleware).get(
  '/',
  di.inject({ users: UserService }, ({ users }, c) => c.text(String(users))),
);
```

`examples/size/package.json` `dependencies` gains `"@nexusdi/express": "*"`, `"@nexusdi/fastify": "*"`, `"@nexusdi/hono": "*"`, `"@nexusdi/react-router": "*"`, `"@nexusdi/next": "*"`, `"express": "5.3.0"`, `"fastify": "5.12.7"`, `"hono": "4.13.13"`, `"react-router": "8.4.0"`, `"next": "16.4.1"`.

Run: `npm install && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- size && node scripts/size-report.mjs`
Expected: PASS, and the report lists `express`, `fastify`, `hono`, `react-router` and `next` under `packages` and `hono-worker` under `standalone`. Record the `hono-worker` figure in the commit message; spec 9.6 measured 28.26 KiB gzip for the probe Worker, and a figure above 1 MB gzip (Vercel Edge Hobby) is a finding.

- [ ] **Step 4: Extend verify-packaging** in `scripts/verify-packaging.mjs`

Add to `LIBS`:

```js
  ['libs/express', '@nexusdi/express'],
  ['libs/fastify', '@nexusdi/fastify'],
  ['libs/hono', '@nexusdi/hono'],
  ['libs/react-router', '@nexusdi/react-router'],
  ['libs/vitest', '@nexusdi/vitest'],
  ['libs/react', '@nexusdi/react'],
  ['libs/next', '@nexusdi/next'],
```

Then add a stage before the bin check, in its own temp directory so the existing consumer stays unchanged:

```js
// The adapters as npm packs them (integrations spec 13.1): every export under
// nodenext and bundler with skipLibCheck false, one request per server
// adapter from the packed build with errors() and nodeScopes(), exact
// @nexusdi/* peers, entry-only core imports and no node: import in the web
// adapters.
const ADAPTERS = [
  'express',
  'fastify',
  'hono',
  'react-router',
  'vitest',
  'react',
  'next',
];
const WEB_ADAPTERS = ['hono', 'react-router', 'next'];
const FRAMEWORKS = [
  'hono@4.13.13',
  '@hono/node-server@2.1.5',
  'express@5.3.0',
  '@types/express@5',
  'fastify@5.12.7',
  'react-router@8.4.0',
  'vitest@4.1.9',
  'next@16.4.1',
  'react@19.3.0',
  'react-dom@19.3.0',
  '@types/react@19.3.0',
];

const ADAPTER_CONSUMER = `
import { Nexus, Token, provide } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { nodeScopes } from '@nexusdi/node';
import { nexus as honoNexus } from '@nexusdi/hono';
import { nexus as expressNexus } from '@nexusdi/express';
import { nexus as fastifyNexus } from '@nexusdi/fastify';
import { nexus as routerNexus, NEXUS_SCOPE } from '@nexusdi/react-router';
import { nexusFixtures } from '@nexusdi/vitest';
import { Hono } from 'hono';
import express from 'express';
import Fastify from 'fastify';
import { once } from 'node:events';

interface IGreeting { text(): string }
const GREETING = new Token<IGreeting>('Greeting');
const ship = await Nexus.create(
  [provide(GREETING, { useValue: { text: () => 'ok' }, lifetime: 'scoped' })],
  { plugins: [errors()] },
);
const scopes = nodeScopes();
const handler = { g: GREETING } as const;

const hono = new Hono().use(honoNexus(ship, { scopes }).middleware);
const honoDi = honoNexus(ship, { scopes });
const h = new Hono().use(honoDi.middleware).get('/', honoDi.inject(handler, ({ g }, c) => c.text(g.text())));
if ((await (await h.request('/')).text()) !== 'ok') throw new Error('hono');

const fDi = fastifyNexus(ship, { scopes });
const f = Fastify();
await f.register(fDi.plugin);
f.get('/', fDi.inject(handler, ({ g }) => g.text()));
if ((await f.inject({ url: '/' })).body !== 'ok') throw new Error('fastify');
await f.close();

const eDi = expressNexus(ship, { scopes });
const e = express().use(eDi.middleware).get('/', eDi.inject(handler, ({ g }, _q, r) => void r.send(g.text())));
const server = e.listen(0);
await once(server, 'listening');
const port = (server.address() as { port: number }).port;
if ((await (await fetch('http://127.0.0.1:' + port + '/')).text()) !== 'ok') throw new Error('express');
server.close();

console.log(typeof routerNexus, typeof NEXUS_SCOPE, typeof nexusFixtures, typeof hono);
await ship[Symbol.asyncDispose]();
`;

const adapterDir = mkdtempSync(join(tmpdir(), 'nexusdi-adapters-'));
writeFileSync(
  join(adapterDir, 'package.json'),
  JSON.stringify({ name: 'adapter-check', private: true, type: 'module' }),
);
writeFileSync(join(adapterDir, 'consumer.ts'), ADAPTER_CONSUMER);
for (const resolution of ['nodenext', 'bundler']) {
  writeFileSync(
    join(adapterDir, `tsconfig.${resolution}.json`),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: resolution === 'nodenext' ? 'nodenext' : 'esnext',
        moduleResolution: resolution,
        lib: ['es2022', 'esnext.disposable', 'dom'],
        skipLibCheck: false,
        outDir: `out-${resolution}`,
        types: ['node'],
      },
      include: ['consumer.ts'],
    }),
  );
}
console.log('Installing the adapter tarballs…');
run(
  'npm',
  [
    'install',
    '--silent',
    '--no-audit',
    '--no-fund',
    ...tarballs.map((t) => join(dir, t)),
    ...FRAMEWORKS,
    '@types/node@22',
    'typescript@6',
  ],
  adapterDir,
);
run('npx', ['tsc', '-p', 'tsconfig.nodenext.json'], adapterDir);
run('npx', ['tsc', '-p', 'tsconfig.bundler.json', '--noEmit'], adapterDir);
run('node', [join(adapterDir, 'out-nodenext', 'consumer.js')], adapterDir);
console.log(
  '  ✓ every adapter resolves under nodenext and bundler, and Hono, Express and Fastify serve a request from the packed build',
);

const CORE_VERSION = JSON.parse(
  readFileSync(join(ROOT, 'libs/core/package.json'), 'utf8'),
).version;
const adapterProblems = [];
for (const name of ADAPTERS) {
  const root = join(adapterDir, 'node_modules', '@nexusdi', name);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {}))
    if (peer.startsWith('@nexusdi/') && range !== CORE_VERSION)
      adapterProblems.push(
        `${manifest.name} pins ${peer} at ${range}, packed version is ${CORE_VERSION}`,
      );
  for (const file of modulesUnder(join(root, 'dist'))) {
    const text = readFileSync(file, 'utf8');
    if (/from\s+["']@nexusdi\/core\/(?!text["'])[^"']+["']/.test(text))
      adapterProblems.push(
        `${file} imports a core path that is not a package entry`,
      );
    if (WEB_ADAPTERS.includes(name) && /from\s+["']node:/.test(text))
      adapterProblems.push(`${file} imports a node: module`);
  }
}
if (adapterProblems.length > 0) throw new Error(adapterProblems.join('\n'));
console.log(
  '  ✓ adapter peers are exact, core is reached through its entries, and the web adapters import no node: module',
);
```

Use the script's existing names for the tarball list and `modulesUnder` (read them near line 55 and the pack step before pasting; the stage reads `tarballs` after the existing pack step fills it). `@nexusdi/next`'s entry imports `next/server`, which loads in plain Node with `next` installed, so the consumer imports it through `typeof` checks only and runs no Next request; `@nexusdi/next-bridge:e2e` runs Next.

Run: `npm run verify:packaging`
Expected: PASS, with the two new `✓` lines.

- [ ] **Step 5: Add the type floor** for each new package

`libs/hono/tsconfig.floor.json` (repeat for `express`, `fastify`, `react-router`, `vitest`, `next`; for `react` add `"jsx": "react-jsx"` and `"lib": ["es2022", "esnext.disposable", "dom"]`):

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "customConditions": ["@nexusdi/source"],
    "lib": ["es2022", "esnext.disposable"],
    "types": ["node"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`scripts/check-type-floor.mjs` `PROJECTS` gains:

```js
  ['@nexusdi/express', 'libs/express/tsconfig.floor.json'],
  ['@nexusdi/fastify', 'libs/fastify/tsconfig.floor.json'],
  ['@nexusdi/hono', 'libs/hono/tsconfig.floor.json'],
  ['@nexusdi/react-router', 'libs/react-router/tsconfig.floor.json'],
  ['@nexusdi/vitest', 'libs/vitest/tsconfig.floor.json'],
  ['@nexusdi/react', 'libs/react/tsconfig.floor.json'],
  ['@nexusdi/next', 'libs/next/tsconfig.floor.json'],
```

Update the script's header comment to name the seven packages.

Run: `npm run check:type-floor`
Expected: PASS for every pair. A framework whose declarations fail on TypeScript 5.4 raises that adapter's floor: write the new floor into its README Requirements table and into `check-type-floor.mjs` as a per-project compiler override, in the same commit.

- [ ] **Step 6: Run everything and commit**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck && npx prettier --check .`
Expected: PASS.

```bash
git add examples/size scripts/size-report.mjs scripts/size-compare.mjs scripts/verify-packaging.mjs scripts/check-type-floor.mjs tools/repo-checks/src/size-report.test.ts libs/*/tsconfig.floor.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "ci(repo): measure, pack and floor-check the adapters

The size report gives each server adapter a figure with its framework
external, and reports hono-worker, the smallest Workers entry, as a whole
bundle. verify-packaging installs the packed adapters, serves a request
through Hono, Express and Fastify, and checks peers and imports. The type
floor covers the seven new packages.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: the Hono, Express and Fastify guides

Spec 15.1 and 15.2. Three new platform pages, each citing regions in `examples/meridian/src/pages/<slug>.md` that run through the framework's in-process request API. Read the `docs-page` skill and the three pinned documents it names before writing prose.

Files:

- Create: `examples/meridian/src/pages/hono.md`, `examples/meridian/src/pages/express.md`, `examples/meridian/src/pages/fastify.md`, `apps/docs/content/hono.mdx`, `apps/docs/content/express.mdx`, `apps/docs/content/fastify.mdx`
- Modify: `examples/meridian/package.json` (dependencies), `apps/docs/content/_meta.ts` (Guides band), the docs spec vocabulary file if the doc-domain check reads one (`tools/repo-checks/src/doc-domain-allowance.json`)

Interfaces:

- Consumes: `nexus` from `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify`; `nodeScopes` from `@nexusdi/node`.

Notes from the review of Tasks 3 and 6, which each guide carries in its Errors and Shutdown sections:

- The /express/, /fastify/ and /hono/ guides show the one-line recipe of spec 3.6: an error handler that handles `NexusHttpError` by sending its status and status text without logging, so a failure writes only the adapter's line. Each guide also says that a plugin's error message, a third-party `construct` hook's included, reaches the log verbatim.
- The /fastify/ guide tells users to pass `forceCloseConnections` or to call `server.closeAllConnections()` before `close()`. On Node 22.12, plain Fastify's `close()` waits forever for the socket of a request whose client aborted, when a listener on the raw request's `close` event exists (Node 24 closes).

- [ ] **Step 1: Add the example dependencies** to `examples/meridian/package.json`

`dependencies` gains `"@nexusdi/express": "*"`, `"@nexusdi/fastify": "*"`, `"@nexusdi/hono": "*"`, `"@nexusdi/react-router": "*"`, `"@nexusdi/vitest": "*"`, `"@nexusdi/next": "*"`; `devDependencies` gains `"hono": "4.13.13"`, `"@hono/node-server": "2.1.5"`, `"express": "5.3.0"`, `"@types/express": "5.0.6"`, `"fastify": "5.12.7"`, `"react-router": "8.4.0"`, `"next": "16.4.1"`. Run `npm install`.

- [ ] **Step 2: Write the failing regions** `examples/meridian/src/pages/hono.md`

The regions are tests; they fail until the page cites them correctly and the packages build. Write the file in full:

````markdown
# Scope a Hono request examples

Regions for `apps/docs/content/hono.mdx`. Every block runs as a test.

<!-- #region bridge -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
const MISSION = new Token<Mission>('Mission');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class StarCharts implements INavCharts {
  plot(to: string): Course {
    return { to, heading: 42 };
  }
}
class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(NAV_CHARTS, { useClass: StarCharts }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
  exports: [NAV_CHARTS, MISSION],
});
const BridgeApi = defineModule({
  name: 'BridgeApi',
  imports: [Tactical],
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, BridgeApi],
});

await using ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

const bridge = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, c) => {
    log.record(`plotting ${c.req.param('to')}`);
    return c.json({
      course: charts.plot(c.req.param('to')),
      log: log.entries(),
    });
  }),
);

const res = await bridge.request('/course/Kepler-442b', {
  headers: { 'x-mission-id': 'survey-7' },
});
const body = await res.json(); // -> { course: { to: 'Kepler-442b', heading: 42 }, log: ['survey-7: plotting Kepler-442b'] }
console.log(body);
```

<!-- #endregion bridge -->

<!-- #region missing -->

```ts @import.meta.vitest
import { Nexus, Token } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface IFlightLog {
  record(entry: string): void;
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

await using ship = await Nexus.create([]);
const di = nexus(ship, { log: () => {} });

let failure = '';
try {
  di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.text(String(log)));
} catch (error) {
  failure = (error as Error).message.split('\n')[0] ?? '';
}
console.log(failure.includes('NEXUS_MISSING_PROVIDER')); // -> true
const app = new Hono().use(di.middleware);
console.log((await app.request('/')).status); // -> 404
```

<!-- #endregion missing -->

<!-- #region ambient -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});

await using ship = await Nexus.create(Tactical);
const scopes = nodeScopes();
const di = nexus(ship, {
  scopes,
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

// Deep in a service, with no access to the request:
const currentMission = () => scopes.current()?.get(MISSION).id;

const app = new Hono()
  .use(di.middleware)
  .get('/mission', (c) => c.text(currentMission() ?? 'none'));
const reply = await (
  await app.request('/mission', { headers: { 'x-mission-id': 'survey-8' } })
).text(); // -> 'survey-8'
console.log(reply);
```

<!-- #endregion ambient -->
````

Write `examples/meridian/src/pages/express.md` with the same three regions (`bridge`, `missing`, `ambient`), adapted: the `bridge` region builds `const bridge = express(); bridge.use(di.middleware); bridge.get('/course/:to', di.inject(..., ({ charts, log }, req, res) => { log.record(...); res.json({ course: charts.plot(req.params.to), log: log.entries() }); }));`, then `const server = bridge.listen(0); await once(server, 'listening');`, fetches `http://127.0.0.1:${port}/course/Kepler-442b` with the header, asserts the same `// ->` body, and calls `server.close()`. The `ambient` region does the same over `/mission` and claims `// -> 'survey-8'`. The `missing` region claims `// -> true` for the startup error and skips the request.

Write `examples/meridian/src/pages/fastify.md` with the same three regions: `const bridge = Fastify(); await bridge.register(di.plugin); bridge.get<{ Params: { to: string } }>('/course/:to', di.inject(..., ({ charts, log }, req) => { log.record(...); return { course: charts.plot(req.params.to), log: log.entries() }; }));`, then `const res = await bridge.inject({ url: '/course/Kepler-442b', headers: { 'x-mission-id': 'survey-7' } }); const body = res.json(); // -> {...}` and `await bridge.close()`.

Each of the two files repeats the interfaces, tokens, classes and modules of the Hono `bridge` region verbatim, because a region runs as one function body (`examples/meridian/src/request.d.ts` explains why).

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian`
Expected: PASS for the nine new regions (the regions test the packages, which Tasks 1 to 8 built). A region that fails is a package defect: fix the package task's code, not the claim.

- [ ] **Step 3: Write the pages**

`apps/docs/content/hono.mdx`:

````mdx
---
title: Scoping Hono Requests
kind: platform
description: Give every Hono request its own NexusDI scope, typed handler dependencies and disposal when the response ends.
---

# Scoping Hono Requests

A Hono handler that needs request-specific services has to create a scope, hand it to the handler and dispose it after the response. Hono's `stream()` and `streamSSE()` return the response before the body is written, so a scope disposed when the handler returns is gone while the stream still reads it.

`@nexusdi/hono` does this for you. Its middleware gives each request one scope, created the first time a handler asks for a dependency, and disposes it when the response body ends or the client leaves. [Scopes and the REQUEST Token](/scopes/) covers scopes themselves.

## Install

Install the adapter beside core from the `next` tag. The adapter pins the exact core release candidate, so install both together:

```bash
npm install @nexusdi/core@next @nexusdi/hono@next hono
```

## Create the Scope per Request

`nexus(ship, options)` takes your container and a `request` function that maps Hono's context to your `NexusRequest`. Register `di.middleware` on the app, and chain the routes so Hono types `c.var.nexus` in each one.

```ts file=examples/meridian/src/pages/hono.md region=bridge

```

The handler reads `x-mission-id`, and the scoped `FLIGHT_LOG` records the entry under that mission. Each request gets its own log.

**Try it:** Send the request twice with different `x-mission-id` headers. Each reply holds only its own entry.

## Handlers with `inject`

`di.inject({ name: TOKEN }, handler)` resolves the record from the request's scope and passes it as the first argument, with Hono's context second. The adapter checks the record against the container when you define the route, so a token with no provider fails at startup:

```ts file=examples/meridian/src/pages/hono.md region=missing

```

`optional(TOKEN)`, `lazy(TOKEN)` and `all(MULTI)` work in the record as they do in `static deps`.

## When the Scope Is Disposed

The adapter disposes the scope at the first of these: the response body ends, the body errors, the client cancels it, or `c.req.raw.signal` aborts. A response with no body disposes as soon as the handler returns. A request that resolves nothing creates no scope at all.

On Cloudflare Workers the disposal goes to `executionCtx.waitUntil`, so async disposers finish after the response. [Running on Edge Runtimes](/edge/) covers Workers.

## Errors

A NexusDI error raised while the adapter creates the scope or resolves the record becomes Hono's `HTTPException` with status 500, or 503 while the container shuts down. The response body is the status text and carries no error code or token name. The adapter logs the error once, with its code and fields, through the `log` option. Register `errors()` from `@nexusdi/errors` in development to get the full text in that log line.

## Ambient Scope

Code deep in a service can read the request's scope without a parameter. Pass `scopes: nodeScopes()` from `@nexusdi/node`, and the middleware runs the request inside it:

```ts file=examples/meridian/src/pages/hono.md region=ambient

```

`nodeScopes()` runs on Node, Bun, Deno, Workers and Vercel Edge through each runtime's `node:async_hooks`. [Scoping Node.js HTTP Requests](/node-request-scopes/) explains how it works.

## Shutdown

A server keeps its container for the life of the process. Stop the server first, then dispose the container. With `await using ship` at the top level, keep the block open until the server closes, or the container is disposed as soon as the module finishes loading ([Scoping Node.js HTTP Requests](/node-request-scopes/) shows that failure):

```ts no-run
import { serve } from '@hono/node-server';
import { once } from 'node:events';

await using ship = await Nexus.create(Meridian);
const server = serve(createBridge(ship));
process.once('SIGTERM', () => server.close());
await once(server, 'close');
```

## Next Steps

Test the routes with fakes through [Vitest fixtures](/vitest/), or deploy the same app to [Cloudflare Workers and other edge runtimes](/edge/).
````

`apps/docs/content/express.mdx` and `apps/docs/content/fastify.mdx` have the same H2s and the same order, with the framework's own facts in each:

- Express: title "Scoping Express Requests"; the Context paragraph names Express's missing response hook and that an aborted request emits `close` and never `finish`; install `npm install @nexusdi/core@next @nexusdi/express@next express`; the dispose section names `res`'s `close` event; Errors names `NexusHttpError` passed to `next()` with `status`, `statusCode` and `expose: false`; `req.nexus` is typed through the `Express.Request` augmentation; Express 5 only; Shutdown uses `createBridge(ship).listen(3000)` with `await once(server, 'close')`.
- Fastify: title "Scoping Fastify Requests"; Context names that `onResponse` misses a client that disconnects; install `npm install @nexusdi/core@next @nexusdi/fastify@next fastify`; `await bridge.register(di.plugin)`; `di.encapsulatedPlugin` for one encapsulated context; dispose section names `reply.raw`'s `close` event; Errors names `NexusHttpError` with no `code` property, so Fastify's default handler sends none; the log goes to `req.log` with the request id; Shutdown registers `bridge.addHook('onClose', () => ship[Symbol.asyncDispose]())`.

Each page cites its own three regions and writes its own prose; copy no paragraph from the Hono page.

- [ ] **Step 4: Add the pages to the Guides band** in `apps/docs/content/_meta.ts`, after `'node-request-scopes'`

```ts
  hono: { title: 'Scope a Hono request' },
  express: { title: 'Scope an Express request' },
  fastify: { title: 'Scope a Fastify request' },
```

- [ ] **Step 5: Verify**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx build @nexusdi/core && NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck && npx prettier --check .`
Expected: PASS, including `doc-regions`, `doc-exports`, `doc-interface-first`, `doc-domain`, `doc-links` and `doc-prose-budget`. A `doc-domain` finding on `BridgeApi`, `createBridge` or `x-mission-id` means the vocabulary rows of spec 15.2 are not in the allowance file yet: add them to `tools/repo-checks/src/doc-domain-allowance.json` with the reason "integrations spec 15.2 vocabulary". Then run the `docs-reviewer` agent on the three pages and fix every defect it reports.

- [ ] **Step 6: Commit**

```bash
git add examples/meridian apps/docs/content tools/repo-checks/src/doc-domain-allowance.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "docs(docs): add the hono, express and fastify guides

Each guide gives a request its own scope through the adapter, injects a
typed record into a handler, and shows the ambient scope, with regions that
run through the framework's in-process request API.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: the edge guide and the scope pages

Spec 9, 15.1 rows 14, 16, 17, 20, 23 and the `/edge/` row. Created: `/edge/`, `/scope-context/`, `/runtimes/` (absent from `apps/docs/content` on `release/0.4`; the docs spec inventory rows 20 and 23 define them). Amended: `/node-request-scopes/`, `/load/`, `/testing/`.

Files:

- Create: `examples/meridian/src/pages/edge.md`, `examples/meridian/src/pages/scope-context.md`, `apps/docs/content/edge.mdx`, `apps/docs/content/scope-context.mdx`, `apps/docs/content/runtimes.mdx`
- Modify: `apps/docs/content/node-request-scopes.mdx`, `examples/meridian/src/pages/node-request-scopes.md`, `apps/docs/content/load.mdx`, `examples/meridian/src/pages/load.md`, `apps/docs/content/testing.mdx`, `examples/meridian/src/pages/testing.md`, `apps/docs/content/_meta.ts`, `examples/meridian/package.json` (`@nexusdi/vitest`)

Interfaces:

- Consumes: `nexus`, `ContainerSource` from `@nexusdi/hono`; `nexusFixtures` from `@nexusdi/vitest`; the leg logs of Tasks 21 and 22 for `/runtimes/`.

- [ ] **Step 1: Write the edge regions** `examples/meridian/src/pages/edge.md`

````markdown
# Running on Edge Runtimes examples

Regions for `apps/docs/content/edge.mdx`. Every block runs as a test. The
regions run on Node; the bridge API's adapter-runtimes legs run the same
code on workerd, Deno, Bun and the Edge Runtime.

<!-- #region function-form -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

interface Course {
  readonly to: string;
  readonly heading: number;
}
interface INavCharts {
  plot(to: string): Course;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

let downloads = 0;
// Stands in for a fetch of the charts, the I/O Workers refuses at module scope.
async function downloadCharts(): Promise<INavCharts> {
  downloads += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { plot: (to) => ({ to, heading: 42 }) };
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useFactory: downloadCharts, deps: [] })],
});

// The function form: the adapter builds the container on the first request,
// once per isolate, and shares it with every later request.
const di = nexus(() => Nexus.create(Tactical));
const app = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS }, ({ charts }, c) =>
    c.json(charts.plot(c.req.param('to'))),
  ),
);

const replies = await Promise.all([
  app.request('/course/Kepler-442b'),
  app.request('/course/Proxima-b'),
]);
console.log(replies.map((r) => r.status)); // -> [200, 200]
console.log(downloads); // -> 1
```

<!-- #endregion function-form -->

<!-- #region lazy-scoped -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');

let built = 0;
await using ship = await Nexus.create([
  provide(MISSION, {
    useFactory: (request) => {
      built += 1;
      return request.mission;
    },
    deps: [REQUEST],
    lifetime: 'scoped',
    eager: false, // built on first get(), so a request that never reads it pays nothing
  }),
]);

await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
console.log(built); // -> 0
console.log(shuttle.get(MISSION).id); // -> 'survey-7'
```

<!-- #endregion lazy-scoped -->
````

- [ ] **Step 2: Write the edge page** `apps/docs/content/edge.mdx`

````mdx
---
title: Running on Edge Runtimes
kind: platform
description: Build the container once per isolate and scope each request on Cloudflare Workers, Vercel Edge, Deno and Bun.
---

# Running on Edge Runtimes

An edge runtime evaluates your module once per isolate and serves many requests from it. Cloudflare Workers gives a request 10 ms of CPU on the Free plan, and refuses network I/O while the module itself is evaluated. A container built inside a handler spends that budget on every cold isolate, and a container whose factories fetch data cannot be built at module scope at all.

NexusDI runs on these runtimes with `@nexusdi/hono`. You build the container once per isolate, at module scope when you can and on the first request when a factory needs I/O, and each request gets its own scope.

## Build the Container at Module Scope

When no factory does I/O while the container is built, create it at the top of the Worker module. Workers bounds the global scope at 1 s, and the build uses none of a request's CPU:

```ts no-run
import { Nexus } from '@nexusdi/core';
import { createBridge } from './hono';
import { OfflineMeridian } from './ship/meridian';

const ship = await Nexus.create(OfflineMeridian);
export default createBridge(ship);
```

A cold first build of 55 providers measured 5.18 ms on a fast laptop, about half the Free plan's request budget. At module scope that time falls outside the request.

## Build on the First Request when a Factory Needs I/O

Workers refuses I/O in the global scope, and a factory that fetches fails the Worker at startup with `NEXUS_PROVIDER_FAILED`. Pass a function to `nexus()` instead of a container. The adapter calls it on the first request, shares the build with every request that arrives meanwhile, and keeps the container for the life of the isolate:

```ts file=examples/meridian/src/pages/edge.md region=function-form

```

If the build fails, every waiting request gets a 503 and the next request builds again. That first request spends the build time in its own CPU budget.

Read bindings and secrets at module scope with `import { env } from 'cloudflare:workers'`, and pass them to `forRoot()`. A binding call is I/O, so a module that needs one uses `forRootAsync()` and the function form.

## Keep Request Work Lazy

`createScope()` runs every eager scoped factory for each request. Mark synchronous scoped factories `eager: false`, so a request that never reads them does not run them:

```ts file=examples/meridian/src/pages/edge.md region=lazy-scoped

```

Async scoped factories stay eager; core raises `NEXUS_LAZY_ASYNC` for an async one with `eager: false`.

## Singletons and I/O Objects

A singleton built on the first request is shared by every later request. Workers refuses I/O on an object another request's handler created, so a singleton must hold data, never a socket, a stream or a `Response` body. Bind a database client that opens a connection as `scoped`.

## Request Scope and the Ambient Scope

Handlers get their dependencies through `di.inject`, which needs nothing from the runtime. For code that reads the scope without a parameter, pass `scopes: nodeScopes()` from `@nexusdi/node`. The package name says Node, and the code runs on every runtime here through its `node:async_hooks`:

- Cloudflare Workers: from compatibility date 2026-08-04, or with the `nodejs_compat` flag on an earlier date. Without either, the Worker fails to start with `No such module "node:async_hooks"`.
- Vercel Edge, Deno and Bun: no setting needed.

Workers' `AsyncLocalStorage` does not follow a hand-written thenable, so `scopes.current()` inside one can read `undefined`. `di.inject` is unaffected.

## When the Scope Is Disposed

The adapter disposes the scope when the response body ends, and hands the work to `executionCtx.waitUntil`, so async disposers finish after the response. Set the `enable_request_signal` compatibility flag so a client that disconnects aborts `request.signal` and disposes the scope at once:

```jsonc no-run
{
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["enable_request_signal"],
}
```

An isolate gets no shutdown signal, so a Worker never disposes its container.

## Check the Graph Before You Deploy

With the function form, `inject` checks its record on the first request. Run `Nexus.check()` in a test, so a wrong token fails CI before deploy. It compiles the graph without running a factory:

```ts no-run
import { Nexus } from '@nexusdi/core';
import { it } from 'vitest';

it('compiles the Worker graph', () => {
  Nexus.check(Meridian);
});
```

## Next Steps

[Where NexusDI Runs](/runtimes/) lists each runtime with the CI job that tests it. [Scoping Hono Requests](/hono/) covers the adapter in full.
````

- [ ] **Step 3: Write `/scope-context/`** (new)

`examples/meridian/src/pages/scope-context.md` holds one region, `custom`, that builds an object satisfying `{ run, current }` over a plain variable, passes it to `nexus(ship, { scopes })` from `@nexusdi/hono`, and claims `scopes.current()` reads the request's mission inside a synchronous handler (`// -> 'survey-7'`). `apps/docs/content/scope-context.mdx`, `kind: question`, title "Scoping Requests outside Node", opens with the reader's problem (a runtime with no `AsyncLocalStorage`), states that Workers, Deno, Bun and Vercel Edge take `nodeScopes()` through their `node:async_hooks` (link `/edge/`), then shows the custom object for a runtime without it, with its limit: a plain variable holds one scope at a time, so it suits a runtime that serves one request at a time, such as a browser tab's own requests. It ends with a next step to `/edge/`.

- [ ] **Step 4: Write `/runtimes/`** (new)

`apps/docs/content/runtimes.mdx`, `kind: contract`, title "Where NexusDI Runs". One table, one row per package and runtime, with the CI job that tests it. Fill each cell from the job logs of the run on the commit that adds this page (read them with `gh run view <id> --log` for the `adapter-runtimes` and `adapter-peers` jobs):

```mdx
| Package                 | Runtime                           | Evidence                               |
| ----------------------- | --------------------------------- | -------------------------------------- |
| `@nexusdi/core`         | Node 22.12 and later              | `main`, `cli-node-floor`               |
| `@nexusdi/core`         | Bun 1.4.2, Deno 2.9.6             | `toolchain-matrix`, `adapter-runtimes` |
| `@nexusdi/hono`         | Node, through `@hono/node-server` | `main`                                 |
| `@nexusdi/hono`         | Cloudflare Workers (workerd)      | `adapter-runtimes`, leg `workerd`      |
| `@nexusdi/hono`         | Deno 2.9.6                        | `adapter-runtimes`, leg `deno`         |
| `@nexusdi/hono`         | Bun 1.4.2                         | `adapter-runtimes`, leg `bun`          |
| `@nexusdi/hono`         | Vercel Edge (Edge Runtime VM)     | `adapter-runtimes`, leg `edge-runtime` |
| `@nexusdi/hono`         | Netlify Edge                      | not tested; runs on Deno               |
| `@nexusdi/node`         | Workers, Deno, Bun, Vercel Edge   | `adapter-runtimes`, every leg          |
| `@nexusdi/express`      | Node 22.12 and later              | `main`, `adapter-peers`                |
| `@nexusdi/fastify`      | Node 22.12 and later              | `main`, `adapter-peers`                |
| `@nexusdi/react-router` | Node 22.22 and later              | `main`, `adapter-peers`                |
| `@nexusdi/react-router` | Workers, Deno, Bun                | not tested                             |
| `@nexusdi/next`         | Node, Next 15.1 to 16             | `main`, `adapter-peers`                |
```

Below the table, one H2 per entry that needs detail: "Cloudflare Workers" (the compatibility date, `enable_request_signal`, and what the leg's no-flag run showed on an abort, quoted from the log); "Vercel Edge" (the leg runs the Edge Runtime's globals through `@edge-runtime/vm` with Vite's module resolution, so it does not test Vercel's bundler; Vercel recommends Node and Next.js 16.3 dropped `runtime = 'edge'`); "CPU" (spec 9.3's table, with its date and machine). The docs spec section 4.3 row 23 defines the page's purpose; follow its contract anatomy (section 5).

- [ ] **Step 5: Amend the three existing pages**

`apps/docs/content/node-request-scopes.mdx`: add before the last H2, keeping every existing sentence:

```mdx
## With a Framework

An adapter creates the scope, runs the request in `scopes.run()` and disposes the scope when the response ends, so you write none of `dispatch()` yourself. Pass the same `nodeScopes()` object as the adapter's `scopes` option: [Hono](/hono/), [Express](/express/), [Fastify](/fastify/), [React Router](/react-router-ssr/) and [Next.js](/next/).

The adapter guides keep `await using ship` at the top level and hold the block open with `await once(server, 'close')`. The warning above about `await using` at module scope still applies to a module that does not wait for its server to close.
```

`apps/docs/content/load.mdx`: add after "Updating Scopes with `scope.extend()`":

````mdx
## Load a Module for a Lazy Route or Section

A request scope is pinned to the modules that were loaded when it was created, so a route whose module loads after the scope throws `NEXUS_LOADED_AFTER_SCOPE` when it resolves one of that module's tokens. Each adapter's `di.load(Feature)` returns a middleware that loads the module once, extends the request's scope when one exists, and continues. Register it in front of the section's handlers, and write their handlers with the middleware's own `inject`:

```ts file=examples/meridian/src/pages/load.md region=lazy-route

```
````

with a new region `lazy-route` in `examples/meridian/src/pages/load.md`: a Hono app with `di.middleware`, a section `const navigation = di.load(Navigation)` registered with `app.use('/navigation/*', navigation)`, a route written with `navigation.inject({ routes: NAV_ROUTES }, ...)`, the first request into the section answering 200 (`// -> 200`). `Navigation` and `NAV_ROUTES` stay inside this region as `load.md`'s existing regions keep their own names (the Meridian note lists `load.md`'s names as a known conflict; this region adds none beyond `Navigation` and `NAV_ROUTES`, which the integrations spec 3.9 uses).

`apps/docs/content/testing.mdx`: add after "Overriding Modules":

````mdx
## With Vitest Fixtures

`@nexusdi/vitest` turns the testing container into Vitest fixtures. Each test gets a fresh container with your overrides, and a scope when it asks for one, and Vitest disposes both when the test ends, pass or fail:

```ts file=examples/meridian/src/pages/testing.md region=vitest-fixtures

```

[How do I get a container in every Vitest test?](/vitest/) covers `test.override` and file-scoped containers.
````

with a region `vitest-fixtures` in `examples/meridian/src/pages/testing.md` that calls `nexusFixtures(Meridian, { setup: (b) => b.override(NAV_CHARTS, { useValue: fakeCharts }) })` and shows the fixture object's keys (`// -> ['nexusSetup', 'nexusRequest', 'nexus', 'nexusScope']`). A doctest region cannot call `test()` inside a test, so the region shows the fixture definitions; the `/vitest/` page's region (Task 27) runs a fixture through `startVitest`.

- [ ] **Step 6: Navigation** in `apps/docs/content/_meta.ts`

After the `fastify` entry of Task 25:

```ts
  edge: { title: 'Run on edge runtimes' },
  'scope-context': { title: 'How do I scope requests outside Node?' },
```

and `runtimes: { title: 'Where NexusDI runs' },` after `'benchmark-method'`.

- [ ] **Step 7: Verify**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian && NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck && npx prettier --check .`
Expected: PASS. Run `doc-md-siblings` and `doc-navigation` findings to zero, then the `docs-reviewer` agent on all six pages; fix every defect it reports.

- [ ] **Step 8: Commit**

```bash
git add examples/meridian apps/docs/content
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "docs(docs): add the edge guide and the runtime matrix

The edge guide builds the container once per isolate, at module scope or
on the first request for an I/O factory, and covers the ambient scope,
disposal and the CPU budget on Workers. /runtimes/ names the CI job behind
each row. The node, load and testing pages link the adapters.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: the React Router, React, Next and Vitest pages, and the API pages

Spec 15.1 and react spec 14. Created: `/react-router-ssr/` (inventory row 15, absent on `release/0.4`), `/react/`, `/next/`, `/vitest/`, `/api-hono/`, `/api-express/`, `/api-fastify/`, `/api-react-router/`, `/api-vitest/`, `/api-next/`, `/api-react/`, and the four `@nexusdi/react` error pages.

The `/react-router-ssr/` guide carries the sections moved out of Task 10's README: Typed loaders (`inject`), Lazy routes (`di.load`), When the scope is disposed, Errors, Ambient scope, Testing loaders (`NEXUS_SCOPE` and `existingScope`) and Requirements.

Files:

- Create: `examples/meridian/src/pages/react-router-ssr.md`, `examples/meridian/src/pages/react.md`, `examples/meridian/src/pages/next.md`, `examples/meridian/src/pages/vitest.md`, `apps/docs/content/react-router-ssr.mdx`, `apps/docs/content/react.mdx`, `apps/docs/content/next.mdx`, `apps/docs/content/vitest.mdx`, `apps/docs/content/api-hono.mdx`, `apps/docs/content/api-express.mdx`, `apps/docs/content/api-fastify.mdx`, `apps/docs/content/api-react-router.mdx`, `apps/docs/content/api-vitest.mdx`, `apps/docs/content/api-next.mdx`, `apps/docs/content/api-react.mdx`
- Create: `apps/docs/content/errors/NEXUS_REACT_NO_PROVIDER.mdx`, `apps/docs/content/errors/NEXUS_REACT_TRANSIENT_IN_RENDER.mdx`, `apps/docs/content/errors/NEXUS_REACT_NESTED_SCOPE.mdx`, `apps/docs/content/errors/NEXUS_REACT_SECTION_CONFLICT.mdx`, and a sibling `examples/meridian/src/errors/<CODE>.md` for each
- Modify: `apps/docs/content/_meta.ts`, `apps/docs/content/errors/_meta.ts`, `apps/docs/content/api-errors.mdx` (four rows), `tools/repo-checks/src/doc-error-codes-allowance.json` (remove the four entries Task 11 added), `examples/meridian/package.json` (`@nexusdi/react`, `react`, `react-dom`, `@testing-library/react` at the workspace versions)

Interfaces:

- Consumes: every package's public exports (header table); the error classes `NoProviderError`, `TransientInRenderError`, `NestedScopeError`, `SectionConflictError` and their fields (Task 11); Task 15's HMR result, recorded in the ledger; `examples/react-ssr` (Task 19) and `examples/next-bridge` (Task 20) for the `no-run` file layout the pages show.

- [ ] **Step 1: Write the regions**

`examples/meridian/src/pages/react-router-ssr.md`, regions:

- `loader`: builds the bridge module of Task 25's `bridge` region, `const di = nexus(ship, { request: ({ request }) => ({ mission: { id: request.headers.get('x-mission-id') ?? 'survey-7', target: 'Kepler-442b' } }) })` from `@nexusdi/react-router`, a loader `di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, { params }) => { log.record(`plotting ${params['to']}`); return { course: charts.plot(params['to']!) }; })`, then runs `di.middleware` with a `RouterContextProvider` and a `next` that calls the loader, and claims `// -> { course: { to: 'Kepler-442b', heading: 42 } }`.
- `route-test`: the loader test of spec 7.2 with `existingScope(scope)` and `NEXUS_SCOPE` on a scope the region creates, claiming the log entries `// -> ['survey-7: plotting Kepler-442b']`.
- `lazy-route`: `const navigation = di.load(Navigation)`, a loader written with `navigation.inject`, run behind the root middleware and `navigation` in order, claiming the first request resolves (`// -> 'Bridge'`).

`examples/meridian/src/pages/next.md`, region `route`: `nexus(() => Nexus.create(Meridian), { request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }) })` from `@nexusdi/next`, `const GET = di.route({ charts: NAV_CHARTS }, async ({ charts }, request, { params }) => Response.json(charts.plot((await params).to)))`, called directly with `new Request('http://bridge/course/Kepler-442b')` and `{ params: Promise.resolve({ to: 'Kepler-442b' }) }` inside the region; `after` from `next/server` throws outside a Next request, so the region mocks it first with `vi.mock('next/server', () => ({ after: (fn: () => void) => queueMicrotask(fn) }))` and states that in a comment. Claim `// -> { to: 'Kepler-442b', heading: 42 }`. A second region `action` does the same for `di.action({ log: FLIGHT_LOG }, async ({ log }, entry: string) => { log.record(entry); return log.entries(); })` and claims `// -> ['survey-7: docked']`.

`examples/meridian/src/pages/vitest.md`, region `fixtures`: writes a test file and a Vitest config to a temp directory and runs them with `startVitest('test', [], { root, watch: false, reporters: [] })` from `vitest/node`; the test file uses `test.extend(nexusFixtures(Meridian, { setup }))` and asserts a fake through `nexus.get(NAV_CHARTS)`; the region claims the run's state `// -> 'pass'` and that the container was disposed (`// -> true`, read from a file the test's fixture teardown writes).

`examples/meridian/src/pages/react.md`, region `provider`: `renderToString` from `react-dom/server` over `<NexusProvider container={ship}><StarMap /></NexusProvider>`, where `StarMap` calls `useService(NAV_CHARTS)`, claiming the rendered HTML (`// -> '<p>Kepler-442b at 42</p>'`); region `scope-provider`: the same with `ScopeProvider` rendering its `fallback` on the server (`// -> '<p>Docking</p>'`), per react spec section 6.2. The `.md` file uses `tsx` fences with `@import.meta.vitest`; if the doc-examples loader accepts only `ts`, use `React.createElement` in a `ts` fence instead of JSX.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian`
Expected: PASS for every new region.

- [ ] **Step 2: Write the four guide pages**

Each runs Context, Concept, Detail, opens each H2 with a lead-in sentence and ends with a next step.

- `react-router-ssr.mdx`, `kind: platform`, title "Rendering React Router on the Server": H2s Install (`npm install @nexusdi/core@next @nexusdi/react-router@next`), Create the Scope per Request (`app/nexus.server.ts` as `no-run`, then the `loader` region), Loaders with `inject`, Lazy Routes with `di.load` (`lazy-route` region), Testing Loaders (`route-test` region), When the Scope Is Disposed (the body stream end, deferred `<Await>` data included), Errors (a thrown `Response` and `handleError`), Rendering Components (link `/react/`; `entry.server.tsx` passes the request scope to `NexusProvider`), React Router 7 (`future.v8_middleware: true` on 7.9 and later). The file tree of `examples/react-ssr` (Task 19) is shown in a `text` fence.
- `react.mdx`, `kind: platform`, title "Using Services in React Components": follows react spec sections 2 to 9 in teaching order: the provider (`provider` region), `useService`, `ScopeProvider` (`scope-provider` region), section boundaries, server rendering with React Router (link `/react-router-ssr/`), Next.js with `clientOnly` (link `/next/`), and the `react()` development check. Its "when you do not need a container" paragraph comes from react spec section 15.
- `next.mdx`, `kind: platform`, title "Scoping Next.js Route Handlers and Server Actions": Install (`npm install @nexusdi/core@next @nexusdi/next@next`), Create the Container (`app/nexus.server.ts` with `import 'server-only'` first, as `no-run`, and why: a client import then fails the build), Route Handlers (`route` region), Server Actions (`action` region), When the Scope Is Disposed (Next's `after()`, also after an error, `notFound()` and `redirect()`), Errors (a route handler returns 500 or 503 with an empty body; an action throws and Next sends a digest), What Stays Outside (server components keep the `cache()` plus `after()` recipe; client components use `@nexusdi/react` with `clientOnly`; Next 16.3 runs every route on Node), Check the Graph in CI (`Nexus.check`).
- `vitest.mdx`, `kind: question`, title "How do I get a container in every Vitest test?": the four fixtures and their defaults (the table of spec 8.1 as a 4-row table), `test.override` for a suite, `containerScope: 'file'`, the `fixtures` region.

- [ ] **Step 3: Write the API pages**

Each `api-<name>.mdx` is `kind: reference`, with one H2 per export named exactly as exported (`## nexus`, `## NexusHttpError`, `## NEXUS_SCOPE`, `## existingScope`, `## nexusFixtures`, `## NexusProvider`, ...), a `ts signature` fence under each H2 with the declaration from the package's `dist/index.d.ts`, and one or two sentences of what it does. For example, in `api-hono.mdx`:

````mdx
---
title: '@nexusdi/hono API'
kind: reference
description: Every export of @nexusdi/hono, with its signature.
---

# @nexusdi/hono API

`@nexusdi/hono` gives a Hono app a NexusDI scope per request. [Scoping Hono Requests](/hono/) teaches it; this page lists each export.

## nexus

Creates the middleware, `inject`, `scope` and `load` over a container or a function that builds one.

```ts signature
function nexus(ship: ContainerSource, options?: NexusHonoOptions): NexusHono;
```

## NexusEnv

The `Env` the middleware adds to a chained app, so `c.var.nexus` is typed in every route after it.

```ts signature
type NexusEnv = { Variables: { nexus: RequestScope } };
```
````

and `## RequestScope`, `## ContainerSource`, `## NexusHonoOptions`, `## NexusLog` in the same form. Copy each signature from the built `.d.ts` (run `npx nx build @nexusdi/<name>` first); `doc-exports` fails a signature fence under a heading that names no export.

- [ ] **Step 4: Write the four error pages**

Each page follows `apps/docs/content/errors/NEXUS_LEGACY_DECORATORS.mdx`: frontmatter with `kind: code`, `package: '@nexusdi/react'` and `errorClass`, an opening paragraph on who raises it and when, then the H2s "Reproduce `<CODE>`", "Fix `<CODE>`" and "Fields of `<ErrorClass>`". The regions live in `examples/meridian/src/errors/<CODE>.md` and render with `renderToString` from `react-dom/server`, so they run in the Node test environment.

`apps/docs/content/errors/NEXUS_REACT_NO_PROVIDER.mdx`:

````mdx
---
title: NEXUS_REACT_NO_PROVIDER
kind: code
description: A NexusDI hook or component rendered outside a NexusProvider, so it has no container to read.
package: '@nexusdi/react'
errorClass: NoProviderError
---

# NEXUS_REACT_NO_PROVIDER

`useService`, `useContainer`, `ScopeProvider` and `SectionBoundary` read the container from the nearest `NexusProvider`. When a component that calls one of them renders with no `NexusProvider` above it, the hook throws `NEXUS_REACT_NO_PROVIDER` during render. React passes the error to the nearest error boundary, or fails the render when there is none. The usual cause is a test or a story that renders the component alone, or a second React root, such as a portal mounted with its own `createRoot`, that the provider does not wrap.

## Reproduce `NEXUS_REACT_NO_PROVIDER`

The region renders a component that calls `useService` with no provider:

```ts file=examples/meridian/src/errors/NEXUS_REACT_NO_PROVIDER.md region=reproduce

```

The message is core's one line: the code, the field `hook` and the link to this page. In development, `@nexusdi/react` adds a sentence that names the hook.

## Fix `NEXUS_REACT_NO_PROVIDER`

Wrap the tree in `NexusProvider` with your container. In a test, wrap the component the same way with a container from `createTestingContainer`:

```ts file=examples/meridian/src/errors/NEXUS_REACT_NO_PROVIDER.md region=fix

```

A portal created with `createPortal` stays inside the provider's tree. A separate root does not, so give it its own `NexusProvider` over the same container.

## Fields of `NoProviderError`

| Field  | Type     | Meaning                                                             |
| ------ | -------- | ------------------------------------------------------------------- |
| `code` | `string` | `'NEXUS_REACT_NO_PROVIDER'`                                         |
| `hook` | `string` | The hook or component that found no provider, such as `useService`. |
| `name` | `string` | `'NoProviderError'`                                                 |
| `docs` | `string` | `https://nexus.js.org/errors/NEXUS_REACT_NO_PROVIDER`               |

`isNexusError(error, 'NEXUS_REACT_NO_PROVIDER')` narrows an unknown error to `NoProviderError`.
````

`examples/meridian/src/errors/NEXUS_REACT_NO_PROVIDER.md`:

````markdown
# NEXUS_REACT_NO_PROVIDER examples

Regions for `apps/docs/content/errors/NEXUS_REACT_NO_PROVIDER.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Token, isNexusError } from '@nexusdi/core';
import { useService } from '@nexusdi/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

function StarMap() {
  const charts = useService(NAV_CHARTS);
  return createElement('p', null, charts.plot('Kepler-442b').to);
}

let code = '';
try {
  renderToString(createElement(StarMap));
} catch (error) {
  if (isNexusError(error, 'NEXUS_REACT_NO_PROVIDER'))
    code = `${error.code} ${error.hook}`;
}
console.log(code); // -> 'NEXUS_REACT_NO_PROVIDER useService'
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { NexusProvider, useService } from '@nexusdi/react';
import { createTestingContainer } from '@nexusdi/testing';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class StarCharts implements INavCharts {
  plot(to: string) {
    return { to, heading: 7 };
  }
}
const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

function StarMap() {
  const charts = useService(NAV_CHARTS);
  return createElement('p', null, charts.plot('Kepler-442b').to);
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useClass: StarCharts })],
});

// The test swaps the real charts for the fake.
await using ship = await createTestingContainer(Tactical)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
const html = renderToString(
  createElement(NexusProvider, { container: ship }, createElement(StarMap)),
);
console.log(html); // -> '<p>Kepler-442b</p>'
```

<!-- #endregion fix -->
````

The other three pages have the same H2s, each with its own reproduce and fix regions:

- `NEXUS_REACT_TRANSIENT_IN_RENDER` (`TransientInRenderError`, fields `token`, `provider`): raised by `useService` when `react()` is registered and the token resolves to a `transient` provider, because each render would build a new instance. The reproduce region registers `react()` from `@nexusdi/react`, binds `NAV_CHARTS` with `lifetime: 'transient'` and renders `StarMap` in a provider, claiming `// -> 'NEXUS_REACT_TRANSIENT_IN_RENDER NavCharts'`. The fix region binds it `singleton` and claims the rendered HTML. The page states that without `react()` the check does not run (react spec R4).
- `NEXUS_REACT_NESTED_SCOPE` (`NestedScopeError`, no fields): raised by a `ScopeProvider` under another scope after hydration (react spec R7, scopes do not nest until core 0.5). Server rendering renders the `ScopeProvider` fallback and never throws, so the reproduce region uses `@testing-library/react`'s `render` in a `// @vitest-environment jsdom` block, awaits the outer scope and claims `// -> 'NEXUS_REACT_NESTED_SCOPE'`. The fix region moves the inner `ScopeProvider` to a sibling.
- `NEXUS_REACT_SECTION_CONFLICT` (`SectionConflictError`, field `section`): raised by `SectionBoundary` when two `lazySection` calls share a name with different loaders. The reproduce region declares `lazySection('navigation', loadA)` and `lazySection('navigation', loadB)`, renders both boundaries in a jsdom block and claims `// -> 'NEXUS_REACT_SECTION_CONFLICT navigation'`. The fix region gives each section its own name. The page states the development case of react spec 12.3: the first conflict after an edit reloads the page once, and a second throws.

Each `.mdx` page's opening paragraph names who raises the code and when, from react spec section 14 and Task 11's raise helpers; no page copies another's paragraphs.

Then empty the allowance. `tools/repo-checks/src/doc-error-codes-allowance.json` returns to:

```json
{}
```

Add the four codes to `apps/docs/content/errors/_meta.ts` in the order the file uses (alphabetical by code) and one row each to the code table in `apps/docs/content/api-errors.mdx` and to its "How Each Code Arrives" list ("thrown in render by `@nexusdi/react`; never wrapped").

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- doc-error-codes`
Expected: PASS. Before the allowance is emptied, `doc-error-codes` reports the four entries as stale.

- [ ] **Step 5: Settle the contracts reload line from Task 15**

Read the ledger entry Task 15 Step 5 wrote for the HMR contracts test.

- If the contracts edit showed `NEXUS_MISSING_PROVIDER`, add to `react.mdx` under its HMR H2, after the sentence on service edits:

```mdx
An edit to a file that declares tokens, such as `contracts.ts`, creates new `Token` objects that the running graph does not know. The page reloads in full for such a file. Add `import.meta.hot?.accept(() => location.reload())` to it, or keep tokens in a file that changes rarely.
```

The sentence describes the Vite dev server, which no region can run. If `doc-commitments` flags it, add an entry to `tools/repo-checks/src/doc-commitments-allowance.json` with the reason "HMR behaviour, covered by libs/react's HMR e2e (Task 15)".

- If the contracts edit swapped cleanly, `react.mdx` says nothing about contracts files, and the ledger records why.

- [ ] **Step 6: Navigation** in `apps/docs/content/_meta.ts`

Guides band, after `edge`:

```ts
  'react-router-ssr': { title: 'React Router server rendering' },
  react: { title: 'Use services in React components' },
  next: { title: 'Scope a Next.js route or action' },
  vitest: { title: 'How do I get a container in every Vitest test?' },
```

API band, after `'api-errors'`:

```ts
  'api-hono': { title: '@nexusdi/hono' },
  'api-express': { title: '@nexusdi/express' },
  'api-fastify': { title: '@nexusdi/fastify' },
  'api-react-router': { title: '@nexusdi/react-router' },
  'api-react': { title: '@nexusdi/react' },
  'api-next': { title: '@nexusdi/next' },
  'api-vitest': { title: '@nexusdi/vitest' },
```

- [ ] **Step 7: Verify**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t build -p @nexusdi/core @nexusdi/hono @nexusdi/express @nexusdi/fastify @nexusdi/react-router @nexusdi/react @nexusdi/next @nexusdi/vitest && rm -rf apps/docs/.next && NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck && npx prettier --check .`
Expected: PASS, `doc-exports` included. Then run the `docs-reviewer` agent on the fifteen pages; fix every defect it reports.

- [ ] **Step 8: Commit**

```bash
git add examples/meridian apps/docs/content tools/repo-checks/src/doc-error-codes-allowance.json package-lock.json
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "docs(docs): add the react router, react, next and vitest guides and the adapter api pages

The guides teach each package against regions that run as tests, and each
API page lists every export with the signature its build declares. The four
@nexusdi/react codes get their error pages, which empties the allowance.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: the release checklist and the bootstrap notes

Spec 12 and 16, the owner's answer to Q2, and the header's owner-only list. The agent writes the documentation and the checks; every npm, release and GitHub settings step stays the owner's.

Files:

- Modify: `RELEASING.md` ("Packages", "Bootstrapping a new package", "Repository setup" rulesets list), `.claude/skills/nexusdi-release/SKILL.md` ("Packages" list, "Bootstrapping a new package"), `tools/repo-checks/src/release-workflow.test.ts` or a new `tools/repo-checks/src/release-packages-doc.test.ts`
- Create: `specs/plans/2026-10-15-integrations-0.4-release-checklist.md`

Interfaces:

- Consumes: the job ids `adapter-runtimes`, `adapter-peers` and `node-floor` and the leg list `scripts/adapter-peers.json` (Tasks 21 to 23); the seven package folders; the `core-layers` exception for `libs/react/src/dev.ts` (Task 14); the header's six owner-only steps.

- [ ] **Step 1: Write the failing check** `tools/repo-checks/src/release-packages-doc.test.ts`

```ts
import { workspaceRoot } from '@nx/devkit';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RELEASING.md and the release skill list the packages one release
 * publishes. A package added under libs/ without a line there is a package
 * the owner was never told to bootstrap, and its first rc publish fails on
 * npm's OIDC exchange (RELEASING.md, "Bootstrapping a new package").
 */
const libs = readdirSync(join(workspaceRoot, 'libs')).filter((dir) =>
  existsSync(join(workspaceRoot, 'libs', dir, 'package.json')),
);
const published = libs
  .map(
    (dir) =>
      JSON.parse(
        readFileSync(join(workspaceRoot, 'libs', dir, 'package.json'), 'utf8'),
      ) as {
        name: string;
        private?: boolean;
      },
  )
  .filter((pkg) => !pkg.private)
  .map((pkg) => pkg.name.replace('@nexusdi/', ''));

describe.each([['RELEASING.md'], ['.claude/skills/nexusdi-release/SKILL.md']])(
  '%s',
  (file) => {
    const text = readFileSync(join(workspaceRoot, file), 'utf8');
    const section = /## Packages\n([\s\S]*?)\n## /.exec(text)?.[1] ?? '';

    it('lists every published package under libs/', () => {
      for (const name of published)
        expect(section, name).toMatch(new RegExp(`\`(@nexusdi/)?${name}\``));
    });

    it('states the package count', () => {
      expect(section).toMatch(
        new RegExp(`publishes ${published.length} packages`),
      );
    });
  },
);
```

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- release-packages-doc`
Expected: FAIL, `hono` missing and `publishes 9 packages` where 16 are published.

If `RELEASING.md` has no `## Packages` heading (the skill has one; `RELEASING.md` may use another), add the section to `RELEASING.md` under that exact heading in Step 2.

- [ ] **Step 2: Update the package lists**

In `.claude/skills/nexusdi-release/SKILL.md` "## Packages", replace the list paragraph with:

```markdown
The packages under `libs/` form one fixed version group (on `release/0.4` and
on `main` after 0.4.0). The group publishes 16 packages at one version:

`@nexusdi/core`, `decorators`, `devtools`, `errors`, `federation`, `node`,
`testing`, `cli`, `interceptors`, `express`, `fastify`, `hono`,
`react-router`, `vitest`, `react`, `next`.
```

Write the same list and count in `RELEASING.md` "## Packages". Run the check: PASS.

- [ ] **Step 3: Add the bootstrap rounds** to `RELEASING.md` "Bootstrapping a new package", after the existing commands

```markdown
#### 0.4 adapters

0.4.0-rc.2 adds seven packages, which need their npm names before the rc
that first publishes them. `bootstrap.sh` reads `libs/<pkg>/package.json`, so
run each round from a checkout of `release/0.4` that has the folders.

Round one, before 0.4.0-rc.2 (owner):

    for pkg in express fastify hono react-router vitest react; do
      .claude/skills/nexusdi-release/scripts/bootstrap.sh "$pkg" <otp>
    done

Round two, after the Next gate passes and `libs/next` is on `release/0.4`,
before the rc that first carries it (rc.2, or rc.3 if Next follows):

    .claude/skills/nexusdi-release/scripts/bootstrap.sh next <otp>

After each round: set each package's trusted publisher (organization
`NexusDI`, repository `core`, workflow `release.yml`, environment `release`,
"Allow npm publish" and "Allow npm dist-tag" on), deprecate the placeholders
with `deprecate.sh <otp> <pkg> ...`, and confirm each with
`npm trust list @nexusdi/<pkg> --otp=<code>`. A one-time code expires in
about 30 seconds, so pass a fresh one to each command.
```

Mirror the two rounds in the skill's "Bootstrapping a new package" section with the `!`-prefixed commands the skill uses for owner commands.

- [ ] **Step 4: Add the three jobs to the documented required checks**

In `RELEASING.md` "Repository setup", change the rulesets rule and the skill's "## Branches" paragraph the same way:

```markdown
- Required status checks `main`, `workflows`, `format`, `packaging`,
  `adapter-runtimes`, `adapter-peers` and `node-floor` (the job ids in
  `ci.yml`) with the strict policy.
```

This records the target state. The rulesets themselves are GitHub settings: the owner adds the three checks to the "Main", "Release branches" and "Maintenance branches" rulesets (owner-only step 5 of the header and the checklist). `tools/release/plan.mjs` reads the required checks from the rulesets, so once the owner adds them, an rc dispatch refuses a commit where any of the jobs is not green. A matrix job reports one check per leg (`adapter-runtimes (workerd)`, `node-floor (core, 22.12.0)`, ...); the checklist names all 36: 4 `adapter-runtimes`, 17 `adapter-peers` and 15 `node-floor`.

- [ ] **Step 5: Write the release checklist** `specs/plans/2026-10-15-integrations-0.4-release-checklist.md`

````markdown
# 0.4.0-rc.2 with the adapters: release checklist

The agent steps are done when this file is merged. The owner's answers of
2026-10-15: all adapters in rc.2, Next may follow in rc.3, and 0.4.0 final
waits until every adapter has been in at least one RC with its demo app
green.

## Owner-only steps

These six are the owner's, from a machine logged in to npm with 2FA or with
admin rights on NexusDI/core. The numbers match the plan header, and the
timeline below says when each runs.

1. Bootstrap each new npm name, set its trusted publisher and deprecate the
   placeholder. Round one: `express`, `fastify`, `hono`, `react-router`,
   `vitest`, `react`. Round two, after the Next gate passes: `next`.
2. Confirm each publisher with `npm trust list @nexusdi/<pkg> --otp=<code>`.
3. Dispatch the `rc` event that publishes 0.4.0-rc.2, and rc.3 if Next
   follows. A `resume` dispatch after a failed publish counts as this step.
4. Run any `npm dist-tag add` command the reconcile step prints.
5. Add the `adapter-runtimes`, `adapter-peers` and `node-floor` checks, one
   per matrix leg, to the required status checks of the release rulesets.
6. Dispatch the `stable` event at 0.4.0 final, which tags 0.4.0 and
   fast-forwards `main`.

## Repo-check exceptions this work adds

- `tools/repo-checks/src/core-layers.ts`: `react/src/dev.ts` may read
  `process.env.NODE_ENV`, and no other file in `libs/react` may read
  `process` (Task 14). Every React toolchain replaces the expression at
  build time, as React itself relies on. The core spec section 12 owner
  takes the exception with this plan.
- `tools/repo-checks/src/owner-vocabulary.test.ts`: one
  `isNexusError(error, 'NEXUS_DISPOSED')` literal per server adapter, in
  its `request-scope.ts` (Tasks 1 and 17).

## Before rc.2

1. Agent: Tasks 1 to 27 merged to `release/0.4`, with `main`, `workflows`,
   `format`, `packaging`, `adapter-runtimes` and `adapter-peers` green on the
   head commit.
2. Owner-only steps 1 and 2, round one (`RELEASING.md`, "0.4 adapters"):

   ```sh
   for pkg in express fastify hono react-router vitest react; do
     .claude/skills/nexusdi-release/scripts/bootstrap.sh "$pkg" <otp>
   done
   ```

   Then the trusted publisher for each on npmjs.com (organization `NexusDI`,
   repository `core`, workflow `release.yml`, environment `release`, "Allow
   npm publish" and "Allow npm dist-tag" on), then:

   ```sh
   .claude/skills/nexusdi-release/scripts/deprecate.sh <otp> express fastify hono react-router vitest react
   for pkg in express fastify hono react-router vitest react; do
     npm trust list "@nexusdi/$pkg" --otp=<code>
   done
   ```

3. Owner-only step 5: in GitHub settings, Rules, Rulesets, add these
   required checks to "Main", "Release branches" and "Maintenance
   branches", spelled as a pull request's checks list shows them:
   - `adapter-runtimes (workerd)`, `adapter-runtimes (deno)`,
     `adapter-runtimes (bun)`, `adapter-runtimes (edge-runtime)`
   - `adapter-peers (<leg>)` for each leg of `scripts/adapter-peers.json`:
     `hono-floor`, `hono-latest`, `express-floor`, `express-latest`,
     `fastify-floor`, `fastify-latest`, `react-router-7-floor`,
     `react-router-7-latest`, `react-router-8-latest`, `react-floor`,
     `react-19-latest`, `vitest-floor`, `vitest-4-latest`, `vitest-5-latest`,
     `next-floor`, `next-15-latest`, `next-16-latest`
   - `node-floor (<lib>, <node>)` for each matrix entry of the `node-floor`
     job: `core`, `decorators`, `devtools`, `errors`, `express`, `fastify`,
     `federation`, `hono`, `interceptors`, `next`, `node`, `react`,
     `testing` and `vitest` at `22.12.0`, and `react-router` at `22.22.0`

   Agent, after: `gh api repos/NexusDI/core/rules/branches/release%2F0.4`
   lists all 36 new contexts.

4. If the Next gate passed and Task 17 is merged: owner-only steps 1 and 2,
   round two, now, so Next publishes in rc.2:

   ```sh
   .claude/skills/nexusdi-release/scripts/bootstrap.sh next <otp>
   .claude/skills/nexusdi-release/scripts/deprecate.sh <otp> next
   npm trust list @nexusdi/next --otp=<code>
   ```

   If the gate has not passed, `libs/next` is not on `release/0.4` and rc.2
   goes without it.

## rc.2

5. Agent: dispatch the dry run and read the plan, the version previews (every
   package at `0.4.0-rc.2`, every adapter's `@nexusdi/core` peer rewritten to
   `0.4.0-rc.2`) and the dist-tag moves:

   ```sh
   gh workflow run release.yml --ref release/0.4 -f event=rc -f dry-run=true
   gh run watch <run-id> --exit-status
   ```

6. Owner-only step 3: dispatch the real run, which publishes:

   ```sh
   gh workflow run release.yml --ref release/0.4 -f event=rc -f dry-run=false
   ```

   If a new package rejected the OIDC publish with a 404, confirm its
   publisher with `npm trust list` (owner-only step 2), wait, then dispatch
   `gh workflow run release.yml --ref release/0.4 -f event=resume -f dry-run=false`.

7. Owner-only step 4, only if the reconcile step printed one: run each
   `npm dist-tag add @nexusdi/<pkg>@0.4.0-rc.2 <tag> --otp=<code>` it
   printed. Agent, after: `npm view @nexusdi/<pkg> dist-tags` shows `latest`
   and `next` at `0.4.0-rc.2` for each new package.

## rc.3 (only if Next follows)

8. Owner-only steps 1 and 2, round two (step 4's commands), then steps 5
   to 7 with rc.3.

## 0.4.0 final

9. Agent: confirm every adapter has been in at least one published RC with
   its demo app job green on that RC's commit, and record the RC and run for
   each in this file.
10. Owner-only step 6: the `stable` event, which tags 0.4.0, fast-forwards
    `main` and publishes with `latest` (`RELEASING.md`, "stable
    (promotion)"). The agent runs the dry run first:

    ```sh
    gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=true
    gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=false   # owner
    ```
````

- [ ] **Step 6: Verify and commit**

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks && npx prettier --check .`
Expected: PASS.

```bash
git add RELEASING.md .claude/skills/nexusdi-release/SKILL.md tools/repo-checks/src/release-packages-doc.test.ts specs/plans/2026-10-15-integrations-0.4-release-checklist.md
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "docs(release): list the adapters and their bootstrap rounds

RELEASING.md and the release skill name the 16 packages a release
publishes, and a check holds both lists to libs/. The bootstrap section
gives the two rounds for the adapters, and the checklist for rc.2 marks
every npm, release and ruleset step as the owner's.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
NX_NO_CLOUD=true NX_DAEMON=false git push
```

---

## Self-review notes

- Spec coverage: 3.1 to 3.9 shared design (Task 1, copied in Tasks 5, 7, 9, 17); 3.10 public API only (every adapter task); 4 Hono (Tasks 7, 8); 5 Express (Tasks 1 to 3); 6 Fastify (Tasks 5, 6); 7 React Router (Tasks 9, 10); 8 Vitest (Task 4); 9 edge runtimes (Task 18 worker source, Tasks 21, 22, 24, 26); 10 Next (gate Task 16, package Task 17, demo Task 20, guide Task 27); 11 layout (each package's first task, Task 24); 12 release (Task 28 and the owner-only steps); 13 verification (Tasks 21 to 24); 14 demo apps (Tasks 18 to 20); 15 docs (Tasks 25 to 27); 16 delivery order (task order; the allowlist globs land in Tasks 5 and 9, the `NEXUS_DISPOSED` entry for Next in Task 17).
- React spec (`origin/spec/react` at `26cb2a26`): ready to plan. K1, K2, K3 and K6 are in rc.1. Tasks 11 to 15 implement it, with these departures forced by checks on `release/0.4`: the four `NEXUS_REACT_*` codes carry inline text in every build (`error-text-placement.test.ts`; development-only text is extension principle V11, still with the owner); one `core-layers` exception for `libs/react/src/dev.ts`'s `process.env.NODE_ENV` read (Task 14, recorded in Task 28); the `react()` setup keeps a closure over `context.blueprint()` in place of the context itself; four `doc-error-codes` allowance entries that Task 27 removes; Meridian names in place of `STAR_CATALOG` and `Cartography`; rc.2 in place of R16's rc.0.
- Decisions the tasks took that change spec text, applied in the spec with this plan: `nexusSetup` is an array of builder steps and `@vitest/runner` is a peer of `@nexusdi/vitest` (spec 8.1, 8.3).
- Departures recorded for the ledger, each with its reason in the owning task: the React Router fixture app lives in `libs/react-router/test-fixtures/app` (its server helper imports `node:` modules, which `nodeViolations` refuses under `src/`) and is served by `@react-router/node` on port 0; `MISSION` lives in `BridgeApi` and `Tactical` is a function of the relay URL (Task 18); `NAV_AUDIT` and `INavAudit` are new names for the demo app's interceptor, which Task 18 records for the docs spec's vocabulary; each adapter's `test-support/nexus-request.ts` augments `NexusRequest` (required `mission` in Hono and React Router to test the required-`request` path, optional elsewhere).
- Steps written as checks with a stated fallback, because they depend on behaviour no one has run yet: Fastify's route generic through `inject`, `base.extend(nexusFixtures(...))` inference, `fetchMock` in pool-workers 0.23.0, React Router 8's `loadContext` in `handleRequest` (Task 15 stops and records it if absent), `await using` in Next app files, `ship.load(Navigation)` seeing root exports.
- Placeholder scan: no "TBD", "TODO" or "similar to Task N". Shared names (`ScopeRunner`, `RequestOption`, `validateNow`, `logEach`, `OptionsArg`) are defined once in Task 1's `request-scope.ts` and imported by Tasks 7, 9 and 17.
