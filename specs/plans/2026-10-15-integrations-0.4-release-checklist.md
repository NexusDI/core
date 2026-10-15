# 0.4.0-rc.2 with the adapters: release checklist

The agent steps are done when this file is merged. The owner's answers of
2026-10-15: all adapters in rc.2, and 0.4.0 final waits until every adapter
has been in at least one RC with its demo app green.

## Owner-only steps

These six are the owner's, from a machine logged in to npm with 2FA or with
admin rights on NexusDI/core. The numbers match the plan header, and the
timeline below says when each runs.

1. Bootstrap each new npm name, set its trusted publisher and deprecate the
   placeholder: `express`, `fastify`, `hono`, `react-router`, `vitest`,
   `react`. `@nexusdi/next` moved to 0.5.
2. Confirm each publisher with `npm trust list @nexusdi/<pkg> --otp=<code>`.
3. Dispatch the `rc` event that publishes 0.4.0-rc.2. A `resume` dispatch
   after a failed publish counts as this step.
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
  `isNexusError(error, 'NEXUS_DISPOSED')` literal per server adapter, in its
  `request-scope.ts` (Task 1 onward).

## Before rc.2

1. Agent: Tasks 1 to 28 merged to `release/0.4`, with `main`, `workflows`,
   `format`, `packaging`, `adapter-runtimes`, `adapter-peers` and
   `node-floor` green on the head commit.
2. Owner-only steps 1 and 2 (`RELEASING.md`, "0.4 adapters"), one fresh
   one-time code per command:

   ```sh
   .claude/skills/nexusdi-release/scripts/bootstrap.sh express <otp>
   .claude/skills/nexusdi-release/scripts/bootstrap.sh fastify <otp>
   .claude/skills/nexusdi-release/scripts/bootstrap.sh hono <otp>
   .claude/skills/nexusdi-release/scripts/bootstrap.sh react-router <otp>
   .claude/skills/nexusdi-release/scripts/bootstrap.sh vitest <otp>
   .claude/skills/nexusdi-release/scripts/bootstrap.sh react <otp>
   ```

   Then the trusted publisher for each on npmjs.com (organization `NexusDI`,
   repository `core`, workflow `release.yml`, environment `release`, "Allow
   npm publish" and "Allow npm dist-tag" on), then:

   ```sh
   .claude/skills/nexusdi-release/scripts/deprecate.sh <otp> express fastify hono react-router vitest react
   npm trust list @nexusdi/express --otp=<code>
   npm trust list @nexusdi/fastify --otp=<code>
   npm trust list @nexusdi/hono --otp=<code>
   npm trust list @nexusdi/react-router --otp=<code>
   npm trust list @nexusdi/vitest --otp=<code>
   npm trust list @nexusdi/react --otp=<code>
   ```

3. Owner-only step 5: in GitHub settings, Rules, Rulesets, add these 32
   required checks to "Main", "Release branches" and "Maintenance
   branches", spelled as a pull request's checks list shows them:
   - `adapter-runtimes (workerd)`, `adapter-runtimes (deno)`,
     `adapter-runtimes (bun)`, `adapter-runtimes (edge-runtime)`
   - `adapter-peers (<leg>)` for each leg of `scripts/adapter-peers.json`:
     `hono-floor`, `hono-latest`, `express-floor`, `express-latest`,
     `fastify-floor`, `fastify-latest`, `react-router-7-floor`,
     `react-router-7-latest`, `react-router-8-latest`, `react-floor`,
     `react-19-latest`, `vitest-floor`, `vitest-4-latest`, `vitest-5-latest`
   - `node-floor (<lib>, <node>)` for each matrix entry of the `node-floor`
     job: `core`, `decorators`, `devtools`, `errors`, `express`, `fastify`,
     `federation`, `hono`, `interceptors`, `node`, `react`, `testing` and
     `vitest` at `22.12.0`, and `react-router` at `22.22.0`

   Agent, after: `gh api repos/NexusDI/core/rules/branches/release%2F0.4`
   lists all 32 new contexts.

4. `@nexusdi/next` moved to 0.5 (integrations spec 10.1), so no second
   bootstrap round runs before rc.2.

## rc.2

5. Agent: dispatch the dry run and read the plan, the version previews
   (every package at `0.4.0-rc.2`, every adapter's `@nexusdi/core` peer
   rewritten to `0.4.0-rc.2`) and the dist-tag moves:

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

## 0.4.0 final

8. Agent: confirm every adapter has been in at least one published RC with
   its demo app job green on that RC's commit, and record the RC and run for
   each in this file.
9. Owner-only step 6: the `stable` event, which tags 0.4.0, fast-forwards
   `main` and publishes with `latest` (`RELEASING.md`, "stable"). The agent
   runs the dry run first:

   ```sh
   gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=true
   gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=false   # owner
   ```
