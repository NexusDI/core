## Global Constraints

- Commands run from the repository root of the worktree. A single core test file runs with `npx nx test core -- <path relative to libs/core>`; a package's with `npx nx test @nexusdi/<name> -- <path relative to libs/<name>>`.
- The gate: `npx nx run-many -t lint test build typecheck`, `npm run verify:packaging`, `npx prettier --check .`, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes`, `npm run check:type-floor`, `npx nx run @nexusdi/toolchain-matrix:matrix`.
- Every revision 1 test keeps passing, or moves with its feature into the package that now owns the feature, unchanged except for its imports. Two tasks change an existing message string: R13 where the text names `with()`, and R14, where `NEXUS_LOADED_AFTER_SCOPE` gains its fix line (spec §0, D10). New codes and new fields add snapshot entries and change none.
- Error tests run in two modes. In core, a test asserts the code, the fields and the one-line message. In `@nexusdi/errors`, the same scenario runs with `errors()` registered and asserts revision 1's message text character for character.
- `@nexusdi/core` has no `dependencies`. Each optional package has no `dependencies` except `@nexusdi/devtools`, which depends on `@nexusdi/errors`. Each optional package declares `"peerDependencies": { "@nexusdi/core": "<core's version>" }`, the exact version, with no range.
- Every package: `"type": "module"`, `"engines": { "node": ">=22.12" }`, ESM only, one `.` export with the `@nexusdi/source`, `types`, `import` and `default` conditions and no `require` condition. No module in any package uses top-level `await`.
- Every build runs every validation pass. No package, condition or flag skips a compile pass (spec §0, D5).
- No numeric size budget. The size report flags core growth above `coreGrowthPercent: 2` (spec §12.4).
- `get()` and `has()` stay synchronous. Async work happens only in `create`, `load`, `createScope` and `extend()`.
- `NEXUS_PLUGIN_API = 1`, `SUPPORTED_PLUGIN_APIS = [1]`. A plugin is validated at `create` and `check`; its hooks are read once, as own properties.
- Error fields are own enumerable data properties. `code`, `name` and the brand `Symbol.for('nexusdi.error')` are own non-enumerable properties. No field is named `message`, `name`, `stack` or `cause`.
- Codes are never renamed or reused. `NEXUS_NO_SCOPE_CONTEXT` is retired unused.
- `node:` imports and the `process` global appear only in `libs/node/src/`.
- Commit messages follow `commitlint.config.js`. Package scopes after R7: `core`, `decorators`, `testing`, `node`, `errors`, `devtools`, `federation`. Work on core is `feat(core)`, `refactor(core)` or `test(core)`; root config is `chore(repo)`; CI is `ci`. Every commit message ends with the session's attribution trailer when the session provides one.
- Tests: titles in the indicative mood, lower-case first letter, never "should" (`tools/repo-checks/src/test-title-mood.test.ts`). One `describe` per callable export, named after it. Regression tests are `describe('R<nn>')`, one file per R-number, in `libs/<package>/src/regressions/`. Concurrency tests use deferred promises from `test-support/deferred.ts`, never timers.
- Test helpers live in `libs/<package>/test-support/`, outside `src/`, so they never ship.
- Code blocks in this plan are Prettier-formatted. Run `npx prettier --write` on every file a task touched before its commit.
- Prose in comments, READMEs and docs follows the owner's rules: plain sentences, no em dashes, no bold lead-ins, no "not X but Y".

