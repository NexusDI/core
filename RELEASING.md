# Releasing

Every release is a manual dispatch of the Release workflow
(`.github/workflows/release.yml`). The workflow publishes to npm with trusted
publishing over OIDC. This repository has no `NPM_TOKEN` secret and should
never get one.

A release cannot be undone. npm versions are immutable and tags are public, so
a person dispatches every run, and every real run follows a dry run.

## Why no token

npm is retiring the credential CI used to rely on:

- Since 2026-07-31, bypass-2FA granular access tokens can no longer change
  package access, maintainers, or trusted publishing configuration.
- npm targets January 2027 for removing direct publish from a bypass-2FA
  token.

A token that requires 2FA does not help, because unattended automation cannot
answer an interactive 2FA challenge. Trusted publishing removes the long-lived
credential. The npm CLI exchanges the GitHub Actions OIDC token for publish
rights that are short-lived and scoped to this repository, this workflow file
and the `release` environment. npm generates provenance on its own, with no
`--provenance` flag.

## Branches

| Branch           | Holds                                            | Created                                                    | Removed                                   |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- |
| `main`           | default branch, newest stable line, patches      | exists                                                     | never                                     |
| `release/X.Y`    | prerelease line X.Y.0-rc.N, features for X.Y     | by the owner from `main` when X.Y work starts              | by the stable job, after `main` equals it |
| `X.Y.x`          | fixes to the previous line after X.Y+1 is stable | by the stable job of the next line, at the old `main` head | by the owner when the line leaves support |
| `sync/X.Y-<sha>` | one merge of `main` into `release/X.Y`           | by `event=sync`                                            | on merge (`delete_branch_on_merge` is on) |

`main` always equals the newest stable line. Features for the next line target
`release/X.Y`. The stable release of X.Y fast-forwards `main` to the release
commit in the same push that tags it, so `main` never holds X.Y code at an
older version. The branch for 1.0 is `release/1.0`, and its stable creates
`0.N.x` for the last 0.x line.

Feature and fix pull requests rebase-merge everywhere. A sync pull request
merges with a merge commit, because a sync is a merge.

### Sync

A fix released from `main` reaches `release/X.Y` through a sync. Run one after
every release from `main` while a `release/X.Y` exists, and before every
stable. Dependabot updates on `main` travel the same way.

1. Dispatch Release on `release/X.Y` with `event: sync`, dry run first.
2. The job creates `sync/X.Y-<first 12 characters of main's sha>` from
   `release/X.Y` and merges `origin/main` into it.
3. The job then restores the line's own `version` and `@nexusdi/*` pins in
   every `libs/*/package.json`, regenerates `package-lock.json` and commits.
   `libs/*/CHANGELOG.md` merges with the union driver (`.gitattributes`), so
   the sections from both sides stay.
4. The job pushes the branch with the deploy key and opens a pull request into
   `release/X.Y` with the job token.
5. Merge the pull request with a merge commit once the checks are green.

A pull request opened with the job token gets no `pull_request` runs, so
`ci.yml` and `codeql.yml` also run on push to `sync/**` and report on the
branch's head commit. If the pull request still shows a required check or
code scanning as expected or waiting, close it and reopen it.

If `main` is already an ancestor of the line, the sync does nothing. If the
sync branch for that `main` commit already exists, the plan step fails: merge
or close its pull request, delete the branch, and dispatch again.

When a path other than the manifests and the lockfile conflicts, the job pushes
the sync branch at the line's head, lists the conflicting paths in the job
summary and fails. Finish it locally:

```sh
git fetch origin && git switch sync/X.Y-<sha>
git merge origin/main
# resolve the listed paths, then:
node tools/release/sync.mjs restore
git commit --no-edit && git push
gh pr create --base release/X.Y --head sync/X.Y-<sha>
```

`sync.mjs restore` does what the job does in step 3. The git hooks allow the
merge because the branch matches `sync/*`. Before the first sync,
`release/0.4` has no `.gitattributes`, so run
`echo 'libs/*/CHANGELOG.md merge=union' >> "$(git rev-parse --git-path info/attributes)"`
before `git merge` to get the union merge locally. The job does the same.

### Merge commits and the hooks

`.husky/pre-merge-commit` and `.husky/pre-commit` refuse a merge commit on
every branch except `sync/*`. `main`, `release/X.Y` and `X.Y.x` stay linear
apart from the sync merges. Replay work from another branch with
`git cherry-pick` or `git rebase --onto`. The release workflow sets `HUSKY=0`,
so `npm ci` installs no hooks in CI.

## Events

Release has two inputs: `event` and `dry-run`. `dry-run` defaults to `true`.
The workflow computes every version from the branch and the tags.

| `event`  | Runs on                        | Version                                          | npm dist-tag                                     |
| -------- | ------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| `rc`     | `release/X.Y`                  | `X.Y.0-rc.0`, then `X.Y.0-rc.<max+1>`            | `next`; `latest` too for packages with no stable |
| `stable` | `release/X.Y`                  | `X.Y.0`                                          | `latest`, and `next` moves up to it              |
| `patch`  | `main`, `X.Y.x`                | conventional commits, must be the next patch     | `latest` on `main`, `release-X.Y` on `X.Y.x`     |
| `sync`   | `release/X.Y`                  | none                                             | none                                             |
| `resume` | `main`, `release/X.Y`, `X.Y.x` | the newest release tag of the line on the branch | the rule of the original event                   |

Always run with `dry-run: true` first and read the plan step's outputs, the nx
version and changelog previews, and the dist-tag moves. Then dispatch again
with `dry-run: false`.

The plan step (`tools/release/plan.mjs`, decisions in `tools/release/lib.mjs`)
sorts what it finds into two kinds:

- A fatal finding stops the run at once, dry run or not. Examples: the event
  does not run on this branch, or `patch` finds no commit that bumps a
  package.
- A blocker stops a real run before anything changes. A dry run lists the
  blockers in the plan step and the job summary, prints the rest of the
  preview, and then fails at its last step. A dry run that passes means the
  real run would start.

### Preconditions

Every `rc`, `stable` and `patch` run checks:

1. The event runs on this branch (table above).
2. Every status check the rulesets require on the branch is green on the
   commit being released.
3. The tag `@nexusdi/core@<version>` does not exist on origin.
4. No package has the version on npm yet.
5. The version belongs to the branch's line: `X.Y.0-rc.N` or `X.Y.0` on
   `release/X.Y`, the next patch of the newest stable tag on `main` or
   `X.Y.x`.

`rc` also checks:

- The line is ahead of the newest stable on `main`, and `X.Y.0` is not tagged
  yet.
- Every package has the line's newest rc on npm. If one is missing, finish
  that rc with `event=resume` first.

`stable` also checks:

- `origin/main` is an ancestor of the branch. If it is not, run a sync, merge
  its pull request and dispatch again.
- `apps/docs/deploy.json` is in mode `final` or `retired`.
- `apps/docs/archives.json` has an entry for the line this stable moves off
  the docs root. For 0.4.0 that is the existing 0.3 snapshot entry. 0.5.0
  needs a tag entry for 0.4, and the docs build for tag archives lands in a
  later pull request, so 0.5.0 stays blocked until then.

### rc

On `release/X.Y`, with no rc tag of the line, the version is `X.Y.0-rc.0`.
After that it is one past the highest rc tag, compared as numbers, so rc.10
follows rc.9.

1. Verify gate: `nx run-many -t lint test build typecheck` over every project,
   then `npm run verify:packaging`.
2. `nx release version <version>`.
3. `nx release changelog <version> --git-commit --git-tag --git-push --git-remote origin --git-push-args="HEAD:refs/heads/release/X.Y"`.
   One atomic push carries the release commit and the tag, and nx creates the
   GitHub prerelease.
4. `nx release publish --tag next`.
5. Dist-tag reconcile (see "npm dist-tags").
6. `gh workflow run docs.yml --ref main`.

### stable

On `release/X.Y`, the version is `X.Y.0`. Before dispatching:

1. Merge a pull request on `release/X.Y` that sets `apps/docs/deploy.json` to
   `final` with `finalDate`.
2. Make sure `apps/docs/archives.json` has an entry for the retiring line.
3. Run a sync if `main` moved since the last one, and merge its pull request.

The run then:

1. Creates the maintenance branch for the old line (`0.3.x` for 0.4.0) at
   `main`'s head, unless it exists.
2. Runs the verify gate.
3. Runs `nx release version X.Y.0`.
4. Runs `nx release changelog X.Y.0 ... --git-remote origin --git-push-args="HEAD:refs/heads/release/X.Y HEAD:refs/heads/main"`.
   The atomic push moves `release/X.Y`, fast-forwards `main` and adds the tag,
   or changes nothing. If `main` moved after the plan step, GitHub rejects the
   push: run a sync and dispatch stable again.
5. Marks the GitHub release latest.
6. Publishes with `--tag latest`.
7. Moves `next` up to `X.Y.0` for every package whose `next` is lower.
8. Dispatches `docs.yml` on `main`.
9. Deletes `release/X.Y` when it is an ancestor of `main`. Its tags stay.
   Otherwise it warns and keeps the branch.

The stable changelog starts at the newest stable tag reachable from the
branch, which is `main`'s latest patch after the sync, so it covers every
change of the line. The rc sections stay in each package's `CHANGELOG.md`.

### patch

On `main` or `X.Y.x`. nx proposes a version from conventional commits since
the newest stable tag on the branch. The plan step accepts only the next
patch of that tag; a minor goes through a `release/X.Y` branch. While the
package is on 0.x, `adjustSemverBumpsForZeroMajorVersion` turns a `feat` into
a patch and a breaking change into a minor. A breaking change needs a
`BREAKING CHANGE:` footer, or nx reads it as a smaller bump.

On `main`, the publish uses `latest`, and the GitHub release is marked latest.
If a `release/X.Y` exists, run a sync afterwards.

On `X.Y.x`, the publish uses `release-X.Y`, and `latest` stays on the newest
line. The GitHub release is marked not latest, and the newest stable tag's
release is marked latest again. A fix that applies to both lines lands on
`main` first and is cherry-picked to `X.Y.x`.

### Next line

Create `release/X.Y` from `main` when X.Y work starts, and point feature pull
requests at it. `event=rc` computes `X.Y.0-rc.0` from the branch name. Fixes
on `main` reach the line through syncs, and `/next/` builds from the branch as
soon as it is ahead of `main`.

### resume

`resume` finishes a release whose tag reached origin. It runs on the branch
the release ran on and picks the newest release tag of that line reachable
from the branch: any rc or stable on `release/X.Y`, the newest stable of the
line on `X.Y.x`, the newest stable on `main`. If the tag is not on origin,
nothing was released, and the run tells you to dispatch the original event
again.

1. Checks out the tag detached and runs `npm ci`, so the build matches the
   tag's lockfile.
2. Runs the verify gate.
3. Creates the GitHub release if it is missing, with notes from that
   version's section of `libs/core/CHANGELOG.md`, marked prerelease for a
   version with a hyphen.
4. Publishes, unless every package already has the version on npm. nx skips
   packages that have it.
5. Reconciles dist-tags, including the event's own dist-tag.
6. Dispatches `docs.yml` on `main`.
7. For a stable on `release/X.Y`, deletes the branch when it is an ancestor of
   `main`. If the maintenance branch for the old line is missing, it warns;
   create it from the old line's newest tag:
   `git push origin "$(git rev-parse '@nexusdi/core@0.3.3^{commit}'):refs/heads/0.3.x"`.

`rc` refuses to start while the newest rc is missing on npm, so a failed rc
is finished by `resume` and never skipped.

## Tags and GitHub releases

After the nx.json change on `release/0.4`, the packages under `libs/` form a
fixed release group. Every package under `libs/` gets the same version, and each
version gets one tag, `@nexusdi/core@X.Y.Z`, and one GitHub release from the
workspace changelog. Each package keeps its own `CHANGELOG.md`.

`main` keeps the independent one-package config until the 0.4.0 promotion
brings the fixed group. Its tag pattern `{projectName}@{version}` resolves to
the same name, `@nexusdi/core@X.Y.Z`, so every line shares one tag namespace.
The plan step blocks a fixed group whose tag pattern contains
`{projectName}`, because nx does not interpolate it for a fixed group.

nx marks the GitHub release a prerelease when the version has a hyphen. The
workflow sets the latest flag itself, since nx creates releases with
`make_latest: legacy`.

## npm dist-tags

The publish tag follows the version and the branch:

- A prerelease publishes under `next`.
- A patch on `X.Y.x` publishes under `release-X.Y`. npm rejects a dist-tag
  that parses as a semver range, and `X.Y.x` is one.
- Any other stable publishes under `latest`.

After the publish, `tools/release/reconcile.mjs` moves the tags a publish does
not:

- It points `latest` at an rc for every package with no stable version, so a
  bootstrap placeholder never stays the default install.
- It moves `next` up to a new `latest` when `next` is lower.
- On `resume` it also sets the event's own dist-tag, in case the failed step
  was the publish.

`npm dist-tag add` does no OIDC exchange of its own, so the reconcile script
performs the exchange npm's publish does and hands the short-lived token to
`npm dist-tag add`. This needs "Allow npm dist-tag" on every trusted
publisher. A move that fails prints a command for the owner to run locally,
and the run stays green:

```sh
npm dist-tag add @nexusdi/<pkg>@<version> <tag> --otp=<code>
```

A consumer opts into a candidate with `npm install @nexusdi/core@next`.
`npm install @nexusdi/core` resolves an rc only for a package that has never
had a stable version.

## In-workspace dependencies are pinned exactly

`version.versionPrefix` is `""`, so a dependency between two packages in this
workspace is written as `"@nexusdi/other": "1.2.3"`, with no caret. An exact
pin never matches the next version, so `preserveMatchingDependencyRanges`
never preserves it, and nx rewrites it during the version step of the same
run. A sync keeps the line's own pins (see "Sync").

## Verifying a release worked

```bash
npm view @nexusdi/core version
npm view @nexusdi/core dist-tags
npm view @nexusdi/core dist.attestations   # non-null means provenance is there
npm view @nexusdi/core repository          # should point at NexusDI/core
```

`dist.attestations` returning `null` means the package published without
provenance, so the OIDC exchange did not happen. Check that `id-token: write`
is still granted and that the trusted publisher still names `release.yml` and
the `release` environment.

## The docs site redeploys after a publish

`docs.yml` (nexus.js.org) runs on `main` only. The `github-pages` environment
admits `main` only, and one deployment replaces the whole site. A real
release of any event except `sync` ends with
`gh workflow run docs.yml --ref main`. A dry run skips it.

`docs.yml` builds:

- The root from the newest stable `@nexusdi/core@*` tag in modes `final` and
  `retired`.
- `/next/` from the highest `release/X.Y` branch ahead of `main`, else from
  `main` (docs spec §15, amended 2026-10-01). The step prints the branch and
  commit it used.
- The archives listed in `apps/docs/archives.json`.

`docs-next.yml` runs on every push to `release/**` that touches the docs
inputs and dispatches `docs.yml` on `main`, so `/next/` follows the branch.
The `pages` concurrency group queues the runs one after another.

## If a release fails

| Failure point                                  | State                             | Recovery                                                  |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Plan, verify gate or dry run fails             | nothing changed                   | fix on the branch, dispatch again                         |
| Atomic push rejected (branch moved, rule, key) | nothing on the remote             | sync if `main` moved, dispatch again                      |
| GitHub release creation fails after the push   | tag and commit pushed, no release | `event=resume`                                            |
| Publish fails for some packages                | some versions on npm              | `event=resume`; published ones are skipped                |
| Dist-tag reconcile fails                       | versions published, tags off      | run the printed `npm dist-tag add` commands               |
| Docs dispatch fails                            | release complete                  | dispatch `docs.yml` on `main` by hand                     |
| Stable leaves `release/X.Y` or misses `X.Y.x`  | release complete                  | `event=resume` on `release/X.Y`, or the commands it warns |
| Sync stops on conflicts                        | sync branch at the line's head    | finish the merge locally (see "Sync")                     |

Common causes:

- `ENEEDAUTH` or 401 on publish: the trusted publisher is missing, or it no
  longer names `release.yml` and the `release` environment.
- The push fails: the deploy key is missing, revoked, or not a bypass actor
  on the branch's ruleset. The workflow's first step fails when
  `RELEASE_SSH_KEY` is not set in the `release` environment.
- `patch` proposes the wrong version: a breaking change lacks its
  `BREAKING CHANGE:` footer, or the commits since the last tag do not bump
  anything.
- The docs dispatch fails: `actions: write` was removed from `release.yml`, or
  `docs.yml` was renamed.

## Trusted publishers

Every package under `libs/` has a trusted publisher on npmjs.com, under
Settings, Trusted Publisher:

| Field              | Value         |
| ------------------ | ------------- |
| Organization/user  | `NexusDI`     |
| Repository         | `core`        |
| Workflow filename  | `release.yml` |
| Environment        | `release`     |
| Allowed actions    | `npm publish` |
| Allow npm dist-tag | on            |

npm matches the workflow by file name. Renaming `release.yml` breaks
publishing until every trusted publisher is updated. Do not pick a stage-only
action: `nx release publish` runs a plain `npm publish`. With the environment
set, npm refuses a publish from any job outside the `release` environment,
which GitHub grants on `main`, `release/*` and `[0-9]*.x` only.

### Bootstrapping a new package

npm only lets you configure a trusted publisher for a package that exists.
A new package under `libs/` gets a placeholder version published by hand
first. The placeholder version, `0.0.0-bootstrap.0`, exists only in a
temporary copy of the packed package. `libs/<pkg>/package.json` keeps the
group's version, and nothing about the placeholder is committed.

From a maintainer's machine, logged in to npm with 2FA:

```sh
npx nx build <pkg>
npm run verify:packaging
tmp="$(mktemp -d)"
(cd libs/<pkg> && npm pack --pack-destination "$tmp")
tar -xzf "$tmp"/*.tgz -C "$tmp"
cd "$tmp/package"
npm pkg set version=0.0.0-bootstrap.0
npm publish --access public --no-provenance --tag bootstrap --otp=<code>
npm view @nexusdi/<pkg> dist-tags
```

Then configure the trusted publisher as in the table above, and deprecate the
placeholder:

```sh
npm deprecate @nexusdi/<pkg>@0.0.0-bootstrap.0 "Bootstrap placeholder. Install a released version."
rm -rf "$tmp"
```

`--no-provenance` overrides `publishConfig.provenance: true`, which fails
outside CI with "Automatic provenance generation not supported for provider:
null". `--otp` avoids npm's browser auth flow, which redacts the auth URL to
`***` when stdout is not a TTY. npm may point `latest` at the placeholder,
since every package has a `latest`; `npm view` shows it. The next rc's
reconcile step moves `latest` to the rc, because the package has no stable
version.

## Repository setup

This records the live configuration, so a change to it is a deliberate diff
against a known state.

`nx release` pushes the release commit and the tag straight to the branch,
and the rulesets require a pull request. A deploy key can bypass a ruleset on
this repository, so the release workflow pushes as one.

Rulesets:

- "Main" (id 6234520) targets `~DEFAULT_BRANCH` and allows rebase merges
  only.
- "Release branches" targets `release/*` and allows merge and rebase. The
  merge method is for sync pull requests.
- "Maintenance branches" targets `[0-9]*.x` and allows rebase merges only.

For the ids of the last two, see `gh api repos/NexusDI/core/rulesets`.

All three carry the same rules:

- A pull request with 0 required approvals.
- Required status checks `main`, `workflows`, `format` and `packaging` (the
  job ids in `ci.yml`) with the strict policy.
- A `code_scanning` rule for CodeQL.
- `deletion` and `non_fast_forward`.
- One bypass actor, `DeployKey`, always. No role bypasses, so a failing
  required check blocks a maintainer the same as anyone else.

CodeQL runs through the advanced setup in `codeql.yml`, on push and pull
request for `main`, `release/**` and `[0-9]*.x`, plus push to `sync/**`.
Default setup is off.

Environment `release` has deployment branch policies `main`, `release/*` and
`[0-9]*.x`, and holds the `RELEASE_SSH_KEY` secret. A workflow on any other
ref gets neither the key nor npm. The `Main` environment stays: it holds
`NX_CLOUD_ACCESS_TOKEN`.

Deploy keys are enabled for the `NexusDI` org
(`deploy_keys_enabled_for_repositories: true`). The repository carries one
write deploy key titled `release.yml (release environment)`. Its private half
is `RELEASE_SSH_KEY`.

### Rotating the release deploy key

```bash
ssh-keygen -t ed25519 -f release-deploy-key -N "" -C "nexusdi-core release workflow"

gh repo deploy-key add release-deploy-key.pub \
  --repo NexusDI/core \
  --title "release.yml (release environment)" \
  --allow-write

# release.yml reads the secret by this name, from the release environment.
gh secret set RELEASE_SSH_KEY --env release --repo NexusDI/core < release-deploy-key

rm release-deploy-key release-deploy-key.pub
```

Then remove the old key. `gh api repos/NexusDI/core/keys` lists the ids, and
`gh api --method DELETE repos/NexusDI/core/keys/<old-id>` removes one. GitHub
does not retire a replaced key on its own.
