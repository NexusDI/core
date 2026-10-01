---
name: nexusdi-release
description: Agent runbook for every NexusDI release event (rc, stable promotion, patch, sync, resume), npm dist-tags, trusted publishing and bootstrapping a new @nexusdi/* package on npm. Use it whenever a task touches release.yml, a release/X.Y or X.Y.x branch, a version bump, an npm publish or dist-tag, a GitHub release or @nexusdi/core@<version> tag, a sync pull request, a failed release run, or adding a new package under libs/, even when the user only says "cut an rc", "ship 0.4.0", "publish", "promote" or "why is npm latest wrong".
---

# NexusDI release runbook

`RELEASING.md` on `main` is the human source of truth. The design and its lab
results live in `specs/2026-10-01-release-branch-workflow-design.md` on
`origin/spec/release-workflow`. The workflow is `.github/workflows/release.yml`,
and `tools/release/lib.mjs` makes every decision. Read `RELEASING.md` when this
skill and the repo disagree: the repo wins, and this file needs an update.

A release cannot be undone. npm versions are immutable and tags are public.

## Owner-only

An agent prepares, dry-runs and verifies. The owner does these:

- Any dispatch with `dry-run=false` (it publishes, tags or pushes).
- `npm login` and every command that takes `--otp` (bootstrap, deprecate,
  `npm dist-tag add`, `npm trust list`).
- npmjs.com settings, such as trusted publishers.
- Merges to `main`.
- GitHub settings: rulesets, environments, deploy keys, CodeQL setup.

Hand the owner the exact command, prefixed with `!` when they run it in the
Claude Code prompt.

## Branches

- `main` is the default branch and always equals the newest stable line.
  Patches for that line release from it.
- `release/X.Y` carries the prerelease line `X.Y.0-rc.N` and the features for
  X.Y. The owner creates it from `main`. The stable job deletes it once `main`
  contains it.
- `X.Y.x` carries fixes to the previous line once X.Y+1 is stable. The stable
  job of the next line creates it at the old `main` head.
- `sync/X.Y-<sha12>` holds one merge of `main` into `release/X.Y`. It merges
  with a merge commit. Everything else rebase-merges.

Three rulesets ("Main", "Release branches", "Maintenance branches") require
the checks `main`, `workflows`, `format` and `packaging`, plus CodeQL. The only
bypass actor is the deploy key. The GitHub environment `release` admits
`main`, `release/*` and `[0-9]*.x`, and holds the `RELEASE_SSH_KEY` secret. npm
trusted publishing names the same environment, so a run on any other ref gets
neither the key nor npm.

## Packages

The packages under `libs/` form one fixed version group (on `release/0.4` and
on `main` after 0.4.0). The group publishes nine packages at one version:

`@nexusdi/core`, `decorators`, `devtools`, `errors`, `federation`, `node`,
`testing`, `cli`, `interceptors`.

`tools/bench-kit` and `benchmarks` are private and never publish. Each version
gets one tag, `@nexusdi/core@<version>`, and one GitHub release.

## Events

Always dispatch a dry run first, read the Plan step output, the nx version
and changelog previews and the dist-tag moves, then hand the owner the real
dispatch. A dry run fails at its last step when the plan found blockers.

```sh
gh workflow run release.yml --ref <branch> -f event=<event> -f dry-run=true
gh run list --workflow release.yml --limit 3
gh run watch <run-id> --exit-status
gh run view <run-id> --log | less
```

| Event    | Branch                         | Version                                    | npm dist-tag                                        |
| -------- | ------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| `rc`     | `release/X.Y`                  | `X.Y.0-rc.0`, then one past the highest rc | `next`, plus `latest` for packages without a stable |
| `stable` | `release/X.Y`                  | `X.Y.0`                                    | `latest`, and `next` moves up to it                 |
| `patch`  | `main` or `X.Y.x`              | next patch, from conventional commits      | `latest` on `main`, `release-X.Y` on `X.Y.x`        |
| `sync`   | `release/X.Y`                  | none                                       | none                                                |
| `resume` | `main`, `release/X.Y`, `X.Y.x` | newest release tag of the line             | the rule of the original event                      |

### rc

```sh
gh workflow run release.yml --ref release/0.4 -f event=rc -f dry-run=true
gh workflow run release.yml --ref release/0.4 -f event=rc -f dry-run=false   # owner
```

The plan refuses an rc while the newest rc is missing on npm for any package.
Finish that one with `resume` first.

### stable (promotion)

Before the dry run:

1. A pull request on `release/X.Y` sets `apps/docs/deploy.json` to mode
   `final` with `finalDate`, and it is merged.
2. `apps/docs/archives.json` has an entry for the line leaving the docs root.
3. If `main` moved since the last sync, run `sync` and merge its pull request.

```sh
gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=true
gh workflow run release.yml --ref release/0.4 -f event=stable -f dry-run=false   # owner
```

One atomic push tags `X.Y.0`, moves `release/X.Y`, fast-forwards `main` and
creates the old line's `X.Y.x`. If `main` moved after the plan step, the push
is rejected and nothing changes: sync, then dispatch again.

### patch

```sh
gh workflow run release.yml --ref main -f event=patch -f dry-run=true
gh workflow run release.yml --ref 0.3.x -f event=patch -f dry-run=true
```

The plan accepts only the next patch of the newest stable tag on the branch.
A breaking change needs a `BREAKING CHANGE:` footer. A fix for both lines
lands on `main` first and is cherry-picked to `X.Y.x`. After a patch on
`main`, run a sync while a `release/X.Y` exists.

### sync

```sh
gh workflow run release.yml --ref release/0.4 -f event=sync -f dry-run=true
gh workflow run release.yml --ref release/0.4 -f event=sync -f dry-run=false
```

A sync publishes nothing. It pushes `sync/X.Y-<sha12>` and opens a pull request
into `release/X.Y`. Merge it with a merge commit once the checks are green. If the
pull request shows a required check as "expected", close and reopen it. On a
conflict outside the manifests and the lockfile, the job pushes the branch at
the line's head and lists the paths. Finish it locally as `RELEASING.md`,
"Sync", describes, ending with `node tools/release/sync.mjs restore`.

### resume

```sh
gh workflow run release.yml --ref <branch the release ran on> -f event=resume -f dry-run=true
```

Resume finishes a release whose tag reached origin: it checks out the tag,
reruns the verify gate, creates a missing GitHub release, publishes what is
missing (nx skips versions already on npm) and reconciles dist-tags. It never
moves a dist-tag back. If the tag never reached origin, nothing was released:
dispatch the original event again.

## Verify after a real run

Check every published package:

```sh
for p in core decorators devtools errors federation node testing cli interceptors; do
  echo "== $p"; npm view "@nexusdi/$p" dist-tags --json
done
npm view @nexusdi/core@<version> dist.attestations   # non-null means provenance
npm view @nexusdi/core@<version> repository.url      # NexusDI/core
git ls-remote --tags origin "refs/tags/@nexusdi/core@<version>"
gh release view "@nexusdi/core@<version>" --json tagName,isPrerelease
gh api repos/NexusDI/core/releases/latest --jq .tag_name
```

Expect, for an rc: `next` at the rc everywhere, `latest` at the rc only for
packages with no stable, a GitHub release with `isPrerelease: true`. For a
stable: `latest` at `X.Y.0`, `next` not lower than it, and the latest-release
query prints `@nexusdi/core@X.Y.0`. A patch on `X.Y.x` gets `release-X.Y`
and leaves the latest release on the newest line. A
`null` `dist.attestations` means the OIDC exchange did not happen: check
`id-token: write` in `release.yml` and the trusted publisher fields.

## Dist-tag rules

- A prerelease publishes under `next`.
- After the publish, `tools/release/reconcile.mjs` points `latest` at the rc for
  every package with no stable version, so a bootstrap placeholder never stays
  the default install. It also moves `next` up to a new `latest`.
- A patch on `X.Y.x` publishes under `release-X.Y`. npm rejects `0.3.x` as a
  tag because it parses as a semver range.
- Any other stable publishes under `latest`.
- A reconcile move that fails prints an `npm dist-tag add ... --otp=<code>`
  command for the owner. The run stays green.
- Staged publishing (`npm stage publish` plus 2FA approval) is deferred, owner
  decision 2026-10-01. Do not propose it again unless npm changes its defaults.

## Bootstrapping a new package

npm configures a trusted publisher only for a package that exists. A new
package under `libs/` needs this before its first rc. All of it is owner work,
from a machine logged in to npm with 2FA:

1. `! .claude/skills/nexusdi-release/scripts/bootstrap.sh <pkg> <otp>`
   publishes `@nexusdi/<pkg>@0.0.0-bootstrap.0` (a manifest with no code) under
   the dist-tag `bootstrap`.
2. On npmjs.com, `@nexusdi/<pkg>`, Settings, Trusted Publisher, GitHub
   Actions: organization `NexusDI`, repository `core`, workflow `release.yml`,
   environment `release`, "Allow npm publish" on, "Allow npm dist-tag" on.
3. `! .claude/skills/nexusdi-release/scripts/deprecate.sh <otp> <pkg> [<pkg> ...]`
   deprecates the placeholder.
4. Check with `npm trust list @nexusdi/<pkg> --otp=<code>` (owner).

npm may point `latest` at the placeholder. The next rc's reconcile step moves
it to the rc. The package also needs a commitlint scope and the other
first-party wiring the repo-checks ask for.

## Traps

- `nx run <p>:nx-release-publish --dryRun` ignored the flag and sent a real npm
  PUT (spec L11). Never call that target directly. Dry runs go through the
  workflow.
- `nx release publish --projects=<p>` fails on a fixed group (L10). The group
  publishes as one unit.
- The `{projectName}@{version}` tag pattern on a fixed group writes the literal
  tag `{projectName}@0.4.0-rc.0`, and the next run computes the wrong version
  (L1). The fixed group uses `@nexusdi/core@{version}`.
- A rebase merge rewrites SHAs, so the tags of the rewritten commits fall off
  `main`'s history and the next release proposes a version that exists (L8).
  Sync `main` into a release branch with a merge commit, and promote only
  through the stable job's fast-forward.
- Turning CodeQL default setup off while the advanced `codeql.yml` is unmerged
  leaves `main` unscanned, and the `code_scanning` rule then blocks the merge
  that would fix it. Switch default setup off right before merging the
  advanced workflow, then confirm its first run on `main`.
- npm read-after-write lag: `npm view` and `npm deprecate` can 404 for several
  minutes after a publish. Wait and retry before calling it a failure.
- A brand-new package can reject an OIDC publish with a 404 shortly after its
  bootstrap even with a correct trusted publisher. Have the owner confirm the
  publisher with `npm trust list @nexusdi/<pkg> --otp=<code>`, wait, then
  dispatch `event=resume`. nx skips the versions already published.
- The docs `rc` deploy mode needs the docs build pipeline (`postbuild`,
  `check-budgets`) on the branch it builds. The `final` mode root build needs
  `content/blog` on `main`.
- A dry run of `stable` blocks while `apps/docs/deploy.json` is not `final` or
  `retired`, or `archives.json` lacks the retiring line.
- On the owner's Mac, a load average above 20 stalls agents. Check `uptime`
  before dispatching heavy local work. Spotlight is excluded from
  `/Volumes/projects`.
- Prefix every local nx and git command with `NX_NO_CLOUD=true NX_DAEMON=false`,
  or Nx Cloud can hang the command (and the pre-commit hook) for an hour.
