# Release branch workflow design

Date: 2026-10-01
Status: draft for owner review
Scope: NexusDI/core release process, from 0.4.0-rc.0 onward

## 1. Goals and non-goals

### 1.1 Goals

1. Prereleases ship from a version branch. That branch reaches `main` only when its line becomes the new stable release on npm `latest`.
2. Every lifecycle event has one documented command path: rc.0, rc.N, a hotfix to the stable line while an RC is open, the stable promotion, a patch after promotion, a fix to the previous line after promotion, and the next prerelease line.
3. `nx release` infers the right version and changelog at every step. No step depends on a tag that the release branch cannot reach.
4. npm dist-tags follow the owner's rule. A package with no stable version publishes to `latest`. Otherwise a prerelease publishes to `next`.
5. The docs site serves the stable line at the root and the prerelease line at `/next/`, from one GitHub Pages deployment.
6. The workflow repeats for 0.5, 1.0 and later majors with no redesign.
7. Every guard that GitHub, npm or the workflow can enforce is enforced by them. The runbook covers only what they cannot enforce.

### 1.2 Non-goals

- Changing the publishing credential model. npm trusted publishing over OIDC stays, with no `NPM_TOKEN`.
- Changing `projectsRelationship: fixed`. All packages under `libs/` keep releasing at one version.
- Long-term support for more than one previous minor line. The docs spec already bounds retention before 1.0.
- Automating the decision to cut an RC or a stable. A person dispatches every release.

## 2. Current state (2026-10-01)

### 2.1 Branches, tags and pull requests

- `main` carries 0.3.2, published as npm `latest` for `@nexusdi/core`.
- `feat/core-0.4` (head `580120f`) is 268 commits ahead of `main` and 0 behind. Its merge base is `main`'s head `c6b8851`.
- Tags: `@nexusdi/core@0.2.0` through `@nexusdi/core@0.3.2`, `v0.1.0` and `docs-snapshot-0.3`. Both branches contain every core tag.
- PR #60 merges `feat/core-0.4` into `main`. PRs #61 (`@nexusdi/cli`) and #62 (`@nexusdi/interceptors`) target `feat/core-0.4`. Dependabot PRs #41 to #59 target `main`.
- Local worktrees exist for `feat/core-0.4`, `feat/rfc-17-interceptors`, `feat/rfc-18-graph-cli` and about twenty spec and plan branches.

### 2.2 GitHub configuration (read with `gh api`, unchanged by this spec)

- Ruleset 6234520 "Main" targets `~DEFAULT_BRANCH`. Its rules: deletion, non_fast_forward, a pull_request rule with `allowed_merge_methods: ["rebase"]` and thread resolution, code_scanning (CodeQL, high or higher), and required status checks `main`, `workflows`, `format` and `packaging` with `strict_required_status_checks_policy: true`. The only bypass actor is `DeployKey` (always). The ruleset has no `required_linear_history` rule.
- Repository merge settings allow merge commits, rebase and squash. The ruleset narrows `main` to rebase.
- No ruleset covers any other branch. `feat/core-0.4` is unprotected.
- The `github-pages` environment allows deployments from `main` only (custom branch policy). An environment named `Main` exists, and no workflow references it.
- CodeQL default setup is configured (actions, javascript-typescript, weekly). It ran on PR #60 into `main` and did not run on #61 or #62 into `feat/core-0.4`.

### 2.3 Release configuration on `feat/core-0.4`

- nx 23.1.1. `release.projectsRelationship: "fixed"`, `releaseTag.pattern: "{projectName}@{version}"`, conventional commits, `adjustSemverBumpsForZeroMajorVersion: true`, `changelog.projectChangelogs.createRelease: "github"`, `workspaceChangelog: false`, `automaticFromRef: true`.
- `release.yml` is a manual `workflow_dispatch` with inputs `dry-run`, `specifier` and `preid`. It checks out over SSH with the `RELEASE_SSH_KEY` deploy key, runs the verify gate, runs `nx release --skip-publish`, picks one dist-tag for every package (`next` when core's version has a hyphen, else `latest`), publishes with `nx release publish --tag`, and dispatches `docs.yml` on `main`.
- Seven packages sit under `libs/` at 0.3.2 on disk: core, decorators, devtools, errors, federation, node and testing. #61 and #62 add cli and interceptors. Only `@nexusdi/core` exists on npm. The other eight return 404.
- `main` still has `projectsRelationship: "independent"` with one package.

### 2.4 Docs deployment

- `docs.yml` runs on push to `main` (paths filter) and on `workflow_dispatch`. One build job assembles the whole site and one `deploy-pages` job publishes it.
- `apps/docs/deploy.json` holds the mode: `snapshot-only` today, then `rc`, `final` and `retired` (docs spec §15.1). In `rc` the root is the 0.3 snapshot and `/next/` is the new site built from the checked-out ref. In `final` the root builds from the newest stable `@nexusdi/core@X.Y.Z` tag in a second worktree.
- `apps/docs` is identical on `main` and `feat/core-0.4`.
- `tools/repo-checks/src/docs/docs-trigger.ts` requires `on.push.branches` to include `main`, forbids `on.push.tags`, and requires `workflow_dispatch` and the paths list.

### 2.5 The libraries repo

Evanion/libraries releases from `main` only, with independent packages and no prereleases. Its `docs.yml` runs on `main` and builds every archived version from tags pinned in `apps/docs/archives.json`, plus `/next/` from `main`, into one Pages artifact. Its release workflow commits archive pin updates to `main` after tagging. This spec keeps that docs model and adds a prerelease line to it.

## 3. Research findings

### 3.1 How established projects run prerelease lines

| Project          | Pattern                                                                        | Prereleases from                           | How the line becomes stable                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angular          | `main` plus patch branches `X.Y.x`                                             | "the active RC branch" with npm tag `next` | "the active RC branch is published as `latest` on npm and the branch becomes the active patch branch". Fixes merge to the base branch, then tooling cherry-picks them by target label. [1]                                                                                                                                |
| TypeScript       | `release-X.Y` branches                                                         | `release-X.Y`, created at beta             | "we merge the `main` branch into `release-X.Y`" for the RC; the stable bump happens on the release branch; a bot cherry-picks fixes. [2]                                                                                                                                                                                  |
| React            | trunk with channels                                                            | `main` (canary, experimental)              | Canary versions are generated from `main`; stable is cut from the same trunk. No `next` branch. [3]                                                                                                                                                                                                                       |
| Vite, Vitest     | trunk plus a maintenance branch for the previous major                         | `main` (alpha, beta)                       | Stable from `main`; the previous major keeps a maintenance branch for important fixes. [4]                                                                                                                                                                                                                                |
| Nx               | trunk plus dist-tags                                                           | `main` (canary, next, beta)                | Stable from `main` (inferred from its dist-tag process; no primary doc on branches). [5]                                                                                                                                                                                                                                  |
| semantic-release | prerelease branches (`next`, `beta`) and maintenance branches (`N.x`, `N.N.x`) | the prerelease branch                      | Merge the prerelease branch into the release branch. "When merging commits associated with an existing release, semantic-release will treat them as pushed commits and publish a new release if necessary, but it will never add those releases to the distribution channel corresponding to the pre-release branch." [6] |
| changesets       | pre mode                                                                       | a branch other than the default            | "We thoroughly recommend only running prereleases from a branch other than the default branch." Pre mode on the default branch blocks other changes until pre mode exits. [7]                                                                                                                                             |
| release-please   | one config per release branch                                                  | any configured branch                      | Each release branch gets its own release PR; prerelease versioning is opt-in. [8]                                                                                                                                                                                                                                         |
| NestJS           | not confirmed                                                                  |                                            | No primary source found.                                                                                                                                                                                                                                                                                                  |

The four patterns:

- A long-lived `next` branch (semantic-release's default prerelease branch). Feature work targets `next`, and `main` follows it at each stable.
- Per-version release branches (`release-X.Y` in TypeScript, the RC branch in Angular). The branch is cut for the RC and becomes the patch branch or merges back.
- Maintenance branches named after the line (`X.Y.x` in Angular, `N.x` in semantic-release). Fixes for an older line land there.
- Trunk with prerelease tags (React, Vite, Nx). Prereleases and stables both come from `main`. The owner's rule excludes this pattern for NexusDI, and changesets' warning gives the reason: prereleases on the default branch block stable fixes.

Two observations carry into the design. TypeScript merges `main` into the release branch before the RC, which is the same direction this design uses at promotion. Angular keeps the RC branch alive as the patch branch, which this design does with `X.Y.x`.

### 3.2 GitHub

- Rebase-and-merge "always updates the committer information and creates new commit SHAs" [9]. A pull request merged by rebase never puts the head branch's own commits on `main`, even when a fast-forward was possible. Tags on the head branch's commits stay off `main`.
- Ruleset targets accept fnmatch patterns such as `release/**/*`. A "require linear history" rule exists; the Main ruleset does not use it. Strict status checks require the branch to be up to date with its base [10].
- Renaming a branch updates "branch protection policies" and "the base branch for open pull requests". "If the renamed branch is the head branch of an open pull request, this pull request is closed." `git pull` on the old name is not redirected, and local clones must be updated [11].
- Dependabot `target-branch` sends version updates to a non-default branch. "Security update pull requests always target the default branch" [12].
- CodeQL default setup scans pushes to "the repository's default branch, or any protected branch" and pull requests against them [13]. Whether a ruleset counts as protection here is not documented. Observed: no CodeQL run on #61 or #62.
- `make_latest: legacy` means "the latest release should be determined based on the release creation date and higher semantic version". Prereleases cannot be latest [14].
- "Events triggered by the `GITHUB_TOKEN` will not create a new workflow run, with the following exceptions: `workflow_dispatch` and `repository_dispatch` events always create workflow runs" [15]. `release.yml` and a version-branch workflow can dispatch `docs.yml` on `main` with the job token.
- The `github-pages` environment is protected to the default branch by default, and this repository narrows it to `main` explicitly. A Pages deployment publishes one artifact as the whole site [16]. Two branches deploying in turn would each replace the other's files.

### 3.3 npm

- A GitHub Actions trusted publisher matches organization or user, repository, workflow filename and an optional environment name. It has no branch or ref field. For `workflow_dispatch` "validation checks the calling workflow's name" [17]. A run on any branch of `NexusDI/core` from `release.yml` passes the match, and provenance is generated the same way on every ref.
- The environment field is the only ref gate available. A GitHub environment with a deployment branch policy restricts which refs can run the publishing job, and npm then checks the environment name.
- A trusted publisher can only be configured on a package that already exists. npm's setup flow assumes an existing package, and third-party tooling exists to work around it [18]. The current `RELEASING.md` says the same.
- "Publishing a package sets the `latest` tag to the published version unless the `--tag` option is used" [19]. The registry's handling of a brand-new package first published under `--tag next` is not documented. The owner's rule avoids the question: a package with no stable version publishes to `latest`.
- Since 2026-09-30, a trusted publisher can opt into an "Allow npm dist-tag" permission, off by default, which lets the OIDC credential run dist-tag commands such as promoting a version to `latest` or moving `next` [20].

### 3.4 Nx release 23.1.1, read from source

All paths below are under `node_modules/nx/dist/src/command-line/release/`.

- `utils/repository-git-tags.js` lists tags with `git -c versionsort.suffix=- tag --sort -v:refname --merged`. Only tags reachable from `HEAD` count. When that list is empty, and `releaseTag.checkAllBranchesWhen` is not `false`, nx falls back to every tag in the repository.
- `utils/git.js` `getLatestGitTagForPattern`: `strictPreid` defaults to `true` (`config/config.js`). The preid nx passes is `--preid` or the empty string. With no preid, nx considers stable tags only. With preid `rc`, nx prefers tags containing `-rc.` unless the newest stable tag is at least the prerelease's base version.
- `utils/shared.js` `createGitTagValues`: a fixed release group gets one tag, interpolating `{version}` and `{releaseGroupName}` only. `{projectName}` is never interpolated for a fixed group. The Nx reference agrees: `git.tag` creates "a git tag for the overall release, or one tag per project for independent project releases", and the fixed default pattern is `v{version}` [21].
- `utils/git.js` `gitPush` runs `git push --follow-tags --no-verify --atomic` with no refspec. It pushes the current branch to its upstream, so a release on any branch pushes that branch. `release.js` pushes whenever any changelog sets `createRelease`.
- `utils/remote-release-clients/github.js` marks a release as a prerelease from the version's shape, sends `make_latest: 'legacy'`, and updates an existing release for the same tag.
- `changelog.js` takes the changelog's starting point from the same tag lookup, with the new version's preid.
- `nx release` runs from any branch. Nothing in the release command checks the branch name.

### 3.5 Lab results

A throwaway repository under the scratchpad held a fixed group of two packages at 0.3.2, nx 23.1.1 and the `feat/core-0.4` release config. Tags were local. Nothing was published or pushed.

| Id  | Experiment                                                                             | Result                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | Fixed group, pattern `{projectName}@{version}`, `premajor --preid rc`                  | nx created the literal tag `{projectName}@0.4.0-rc.0`. The next run could not find it, resolved 0.3.2 again, and `prerelease --preid rc` produced `0.3.3-rc.0`. This is today's `feat/core-0.4` config.                                                                                                                              |
| L2  | Pattern `@lab/core@{version}`                                                          | rc.0, rc.1, rc.2 chain correctly with `--preid rc`.                                                                                                                                                                                                                                                                                  |
| L3  | rc tags present, no `--preid`                                                          | `prerelease` gave `0.3.3-0`. An empty specifier gave stable `0.4.0`. An empty specifier with `--preid rc` gave `0.4.0-rc.1`.                                                                                                                                                                                                         |
| L4  | Graduation on the version branch                                                       | `patch` gave `0.3.3`, which is what `RELEASING.md` prescribes today. `patch --preid rc` gave `0.4.0`. The explicit `0.4.0` gave `0.4.0`.                                                                                                                                                                                             |
| L5  | Zero-major remap                                                                       | `preminor --preid rc` from 0.4.1 gave `0.4.2-rc.0`. `premajor --preid rc` gave `0.5.0-rc.0`. No relative specifier reaches `1.0.0-rc.0` from 0.x while the remap is on.                                                                                                                                                              |
| L6  | Hotfix on `main` during the RC                                                         | `main` released 0.3.3. Cherry-picking the fix commit, without its release commit, onto the version branch applied cleanly, and rc.2 followed rc.1.                                                                                                                                                                                   |
| L7  | Merge `main` into the version branch, explicit `0.4.0`, fast-forward `main`            | The merge conflicted only on package versions. `0.4.0` resolved the current version from 0.3.3 and its changelog aggregated every change since 0.3.3. After the fast-forward, `main` released 0.4.1, a `0.3.x` branch from tag 0.3.3 released 0.3.4, and the next line's `premajor --preid rc` gave `0.5.0-rc.0`.                    |
| L8  | GitHub rebase-merge emulated by replaying the version branch onto `main` with new SHAs | With a 0.3.3 hotfix on `main`, the replay conflicted on the first rc release commit, so GitHub would refuse the merge. Without a hotfix, the rc tags were unreachable from `main`, where `--preid rc` proposed `0.4.0-rc.0` again. With 0.4.0 tagged on the branch before the replay, the next fix on `main` proposed `0.4.0` again. |
| L9  | GitHub release creation                                                                | With a literal pattern and project changelogs creating releases, nx sent one create per package for the same tag. With `workspaceChangelog: { createRelease: "github", file: false }` and project releases off, nx sent one create per version and still wrote each package's `CHANGELOG.md`.                                        |

L1 and L4 are defects in the current `feat/core-0.4` setup, independent of branching. rc.0 would succeed and every later run would compute the wrong version. The stable step in `RELEASING.md` would publish 0.3.3 from the 0.4 branch.

L8 is the corner the owner asked about. Any promotion that puts rewritten copies of the version branch's commits on `main` leaves its tags behind. The next release then computes from an older tag and proposes a version that already exists.

The red-team review (section 10) added three lab results on the publish and push paths:

- L10. `nx release publish --projects=@lab/errors --tag next --dry-run` stops with "Cannot filter to a subset of projects within fixed release group". A fixed group publishes as one unit, so a per-package `--tag` loop through `nx release publish` is impossible.
- L11. `nx run @lab/errors:nx-release-publish --tag=next --dryRun` ignored the dry-run flag, ran core's publish through `dependsOn`, and sent a real `PUT` to the npm registry. The registry rejected it with 404 because the lab had no credentials. Nobody uses `nx run <project>:nx-release-publish` for a dry run.
- L12. `nx release changelog 0.4.2 --git-commit --git-tag --git-push --git-push-args="HEAD:refs/heads/next HEAD:refs/heads/main" --dry-run` printed `git push --follow-tags --no-verify --atomic origin HEAD:refs/heads/next HEAD:refs/heads/main`. The `version` and `changelog` subcommands accept `--git-push-args`. Top-level `nx release` rejects it. One atomic push can move the version branch, fast-forward `main` and add the tag together.

Two source reads complete the picture. `@nx/js` 23.1.1 `release-publish.impl.js` runs `npm view <pkg> versions dist-tags` before publishing: a version that already has the requested tag is skipped, and a version that exists without it gets `npm dist-tag add`. A re-run of `nx release publish --tag T` is idempotent. nx `release.js` orders the steps as version, changelog, commit, tag, one atomic push, GitHub release, publish. A rejected push throws before any GitHub release exists.

npm rejects dist-tags that parse as semver ranges: "Tags that can be interpreted as valid semver ranges will be rejected. For example, `v1.4` cannot be used as a tag" [22]. `0.3.x` is a range. `release-0.3` is not.

## 4. Chosen workflow

Per-version branches `release/X.Y` carry prereleases. Maintenance branches `X.Y.x` carry fixes to the previous stable line once the next line is stable. `main` stays the default branch and always equals the newest stable line. Fixes to `main` reach the version branch through a sync pull request merged with a merge commit. Promotion is one atomic push from the release workflow that tags `X.Y.0`, updates `release/X.Y` and fast-forwards `main` to the same commit.

The design follows Angular and TypeScript (section 3.1). TypeScript merges `main` into the release branch and cuts the stable on it. Angular turns the old line into an `X.Y.x` patch branch. The promotion here never rewrites a commit, so every tag the next release needs is reachable from the branch it runs on (L7). The rebase-merge path loses that property (L8).

### 4.1 Branches

| Branch           | Purpose                                          | Created                                                    | Removed                                   |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- |
| `main`           | default branch, newest stable line, patches      | exists                                                     | never                                     |
| `release/X.Y`    | prerelease line X.Y.0-rc.N, features for X.Y     | by the owner from `main` when X.Y work starts              | by the stable job, after `main` equals it |
| `X.Y.x`          | fixes to the previous line after X.Y+1 is stable | by the stable job of the next line, at the old `main` head | by the owner when the line leaves support |
| `sync/X.Y-<sha>` | one `main` sync into `release/X.Y`               | by the `sync` event                                        | on merge (`delete_branch_on_merge` is on) |

The name for 1.0 is `release/1.0`, and the maintenance branch that its stable creates is `0.N.x` for the last 0.x line. Nothing in the workflow depends on the major being zero.

### 4.2 Rulesets

- "Main" (6234520) is unchanged. It targets `~DEFAULT_BRANCH`, and `main` stays the default branch.
- New "Release branches" ruleset targeting `release/*`: deletion, non_fast_forward, pull_request with `allowed_merge_methods: ["merge", "rebase"]` and thread resolution, code_scanning (CodeQL), and the same four required checks with the strict policy. Bypass: `DeployKey` (always). Feature pull requests rebase-merge as today. Sync pull requests merge with a merge commit, because a sync is a merge by definition.
- New "Maintenance branches" ruleset targeting `[0-9]*.x`: the same rules with `allowed_merge_methods: ["rebase"]`. Bypass: `DeployKey`.
- The stable job deletes `release/X.Y` through the deploy key. The deletion rule has the same bypass.

### 4.3 Environment and npm

- New GitHub environment `release`. Deployment branch policy: `main`, `release/*`, `[0-9]*.x`. The `RELEASE_SSH_KEY` secret moves from repository secrets into this environment, so a workflow on any other ref never receives the key. The unused `Main` environment can be deleted.
- Every npm trusted publisher: organization `NexusDI`, repository `core`, workflow `release.yml`, environment `release`, allowed action `npm publish`, and the "Allow npm dist-tag" permission enabled. npm then refuses OIDC publishes from any job outside the `release` environment, which GitHub only grants on the three branch patterns.

### 4.4 nx.json (release section, on `release/0.4`)

```jsonc
"releaseTag": {
  // A fixed group gets one tag per release, and nx interpolates only
  // {version} and {releaseGroupName} into it. The literal name keeps the
  // existing @nexusdi/core@X.Y.Z tags, benchmarks.yml's tag trigger and the
  // docs root lookup working.
  "pattern": "@nexusdi/core@{version}"
},
"changelog": {
  // One GitHub release per version. Per-project releases would all target
  // the same tag and overwrite each other.
  "workspaceChangelog": { "createRelease": "github", "file": false },
  "automaticFromRef": true,
  "projectChangelogs": {
    "createRelease": false,
    "renderOptions": { "authors": true, "applyUsernameToAuthors": true, "commitReferences": true, "versionTitleDate": false }
  }
}
```

`strictPreid` stays at its default, `true`. `checkAllBranchesWhen` stays unset: every tag a run needs is reachable, and an all-branches lookup would let `0.3.x` tags leak into 0.4 changelogs. `adjustSemverBumpsForZeroMajorVersion` stays on. It only affects conventional-commit patch runs on `main` and `X.Y.x`, because rc and stable runs pass an explicit version.

The workspace changelog needs `renderOptions` of its own if the owner wants authors in the GitHub release body. That is a formatting choice and does not affect versions.

### 4.5 `.gitattributes`

```
libs/*/CHANGELOG.md merge=union
```

A sync merge keeps both sides' sections, so the 0.3.3 section from `main` survives in the 0.4 changelog files.

### 4.6 Hooks

`.husky/pre-merge-commit` and the merge check in `.husky/pre-commit` allow a merge when the current branch matches `sync/*`. Every other merge is still refused. `release.yml` sets `HUSKY=0`, so `npm ci` installs no hooks in CI. The rebase-only rule for `main` still holds: `main` only receives merge commits through the stable job's fast-forward, and a later pull request into `main` rebase-merges cleanly because those merge commits sit in its base.

## 5. Runbook

Every event is a dispatch of `release.yml` with `event` and `dry-run`. Each one runs with `dry-run: true` first, and the owner reads the printed version, tag, changelog and dist-tags before the real run.

### 5.1 Preconditions every mutating event checks

1. The ref matches the event (table in section 6).
2. The four required checks are green on `HEAD`'s SHA (`gh api repos/NexusDI/core/commits/<sha>/check-runs`).
3. The computed tag does not exist on the remote (`git ls-remote --tags origin`).
4. Every package returns 404 for `npm view <pkg>@<version>`.
5. The computed version belongs to the branch's line: `X.Y.0-rc.N` or `X.Y.0` on `release/X.Y`; a patch of the newest stable `X.Y` tag on `main`; a patch of `X.Y` on `X.Y.x`.
6. For `rc`: the newest rc tag of the line is published on npm. If it is missing, the run stops and points at `event=resume`.

### 5.2 rc.0 and rc.N

Ref: `release/X.Y`.

1. Compute `V`. With no `@nexusdi/core@X.Y.0-rc.*` tag, `V = X.Y.0-rc.0`. Otherwise `V = X.Y.0-rc.<max+1>`, with `max` from `git tag -l` sorted by `sort -V`.
2. Verify gate: `nx run-many -t lint test build typecheck`, then `npm run verify:packaging`.
3. `nx release version V`.
4. `nx release changelog V --git-commit --git-tag --git-push --git-push-args="HEAD:refs/heads/release/X.Y"`. One atomic push carries the release commit and the tag, and nx then creates the GitHub prerelease.
5. `nx release publish --tag next`.
6. Reconcile dist-tags: for each package whose npm `versions` contain no stable version, `npm dist-tag add <pkg>@V latest`. A failure prints the exact commands and does not fail the run.
7. `gh workflow run docs.yml --ref main`.

The explicit version makes the result independent of the zero-major remap (L5), of `strictPreid` (L3) and of which commit types landed. `1.0.0-rc.0` comes from the branch name `release/1.0`.

### 5.3 Fix to the stable line during an RC (0.3.3)

1. The fix pull request lands on `main` by rebase.
2. `event=patch` on `main`: `nx release version` with conventional commits and no preid (L6 gives 0.3.3), `nx release changelog` pushing to `main`, `nx release publish --tag latest`, docs dispatch.
3. `event=sync` on `release/0.4`:
   1. Create `sync/0.4-<main sha>` from `release/0.4`.
   2. `git merge origin/main`. Changelogs merge by union. A script restores the branch side of every `version` field and in-workspace dependency pin in `libs/*/package.json`. A conflicted `package-lock.json` is regenerated with `npm install --package-lock-only`.
   3. With any other conflict, the job pushes the sync branch at `release/0.4`'s head, lists the conflicting paths in the job summary and stops. The owner runs the same merge locally on that branch (the hook allows it on `sync/*`), resolves it, and pushes.
   4. Open a pull request from the sync branch into `release/0.4`.
4. The owner merges the sync pull request with the merge method once checks are green.
5. The next rc's changelog starts at the previous rc tag and lists the fix once.

A sync runs after every `main` release and before every stable. Dependabot updates reach the version branch the same way.

### 5.4 Stable X.Y.0 (0.4.0)

Ref: `release/X.Y`. Before dispatching, the owner merges a pull request on `release/0.4` that sets `apps/docs/deploy.json` to `final` with `finalDate`.

1. Preconditions: section 5.1, plus `git merge-base --is-ancestor origin/main HEAD`. If `main` is not an ancestor, the run stops and asks for a sync.
2. Create the maintenance branch for the old line: `git push origin origin/main:refs/heads/0.3.x`, skipped when it exists. For 1.0 the branch is `0.<last>.x`.
3. Verify gate.
4. `nx release version X.Y.0`.
5. `nx release changelog X.Y.0 --git-commit --git-tag --git-push --git-push-args="HEAD:refs/heads/release/X.Y HEAD:refs/heads/main"`. The atomic push moves `release/X.Y`, fast-forwards `main` and adds the tag, or changes nothing. If `main` moved since the run started, the push is rejected: run a sync and dispatch stable again. nx then creates the GitHub release for `X.Y.0`.
6. `gh release edit @nexusdi/core@X.Y.0 --latest`.
7. `nx release publish --tag latest`.
8. `nx release publish --tag next`. The executor finds each version on npm and runs `npm dist-tag add`, so `next` never points below `latest`. Non-fatal.
9. Commit the archive pin for `/v0.3/` to `main` through the deploy key, then dispatch `docs.yml` on `main`.
10. Delete `release/X.Y`. It equals `main`, and its tags stay.

After step 5, `main`, the tag and the release commit agree, so no state exists where `main` carries 0.4 code at a 0.3 version. A failure in steps 6 to 9 is finished by `event=resume`.

The stable changelog starts at the newest reachable stable tag, which is 0.3.3 after the sync, and aggregates every change of the line (L7). The rc sections stay in each package's `CHANGELOG.md`.

### 5.5 Patch after promotion (0.4.1)

Ref: `main`. Same as 5.3 step 2. L7 gives 0.4.1. If `release/0.5` exists, a sync follows.

### 5.6 Fix to the previous line after promotion (0.3.4)

Ref: `0.3.x`.

1. The fix pull request lands on `0.3.x` by rebase. A fix that also applies to `main` lands there first and is cherry-picked to `0.3.x`.
2. `event=patch` on `0.3.x`: L7 gives 0.3.4.
3. Publish with dist-tag `release-0.3`. `latest` stays on 0.4.x.
4. `gh release edit @nexusdi/core@0.3.4 --latest=false`, then `gh release edit <newest stable tag> --latest`. nx sends `make_latest: legacy`, and the GitHub docs do not say whether creation date or version wins.

### 5.7 Next line (0.5.0-rc.0, 1.0.0-rc.0)

1. The owner creates `release/0.5` from `main` when 0.5 work starts. Features for 0.5 target it.
2. `event=rc` computes `0.5.0-rc.0` from the branch name.
3. Fixes on `main` reach it through syncs.
4. `docs.yml` builds `/next/` from it as soon as it is ahead of `main`.

L7 checked the tag lookup for this case: `main`'s 0.4.1 is the newest stable and the changelog for 0.5.0-rc.0 starts there.

### 5.8 resume

Ref: any of the three patterns. It finishes a release whose tag is on the remote.

1. Check out the newest tag reachable from the branch.
2. If the GitHub release is missing: `gh release create <tag> --verify-tag`, with notes from core's `CHANGELOG.md` section for that version and `--prerelease` when the version has a hyphen.
3. `nx release publish --tag <rule>`. Published packages are skipped.
4. Reconcile dist-tags as in 5.2 step 6, and `latest`/`next` as in 5.4 when the version is stable.
5. Dispatch docs.

### 5.9 Partial failures

| Failure point                                  | State                             | Recovery                                   |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------ |
| Verify gate or dry run fails                   | nothing changed                   | fix on the branch, dispatch again          |
| Atomic push rejected (branch moved, rule, key) | nothing on the remote             | sync if `main` moved, dispatch again       |
| GitHub release creation fails after the push   | tag and commit pushed, no release | `event=resume`                             |
| Publish fails for some packages                | some versions on npm              | `event=resume`; published ones are skipped |
| Dist-tag reconcile fails                       | versions published, tags off      | run the printed `npm dist-tag` commands    |
| Docs dispatch fails                            | release complete                  | dispatch `docs.yml` by hand                |

`rc` refuses to start while the newest rc is missing on npm, so a failed rc.N is finished by resume and never skipped.

### 5.10 Concurrency

`release.yml` uses `concurrency: { group: release, cancel-in-progress: false }`. GitHub keeps one pending run and cancels older pending ones, so two dispatches never interleave. The atomic push protects against `main` moving through a merged pull request.
