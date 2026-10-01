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

- L13. `nx release version 0.4.0-rc.3` staged the manifests without committing. `nx release changelog 0.4.0-rc.3 --git-commit --git-tag --git-push --git-push-args="HEAD:refs/heads/next" --dry-run` then printed one commit `chore(release): publish 0.4.0-rc.3` holding the staged manifests and the changelogs, the tag `@lab/core@0.4.0-rc.3`, and `git push --follow-tags --no-verify --atomic origin HEAD:refs/heads/next`. The two-subcommand sequence the workflow uses produces the same commit and tag as top-level `nx release`.

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

## 6. `release.yml` changes

### 6.1 Inputs and refs

The free-text `specifier` and `preid` inputs go away. The workflow computes every version from the branch and the tags.

| `event`  | Allowed refs                   | Version                                         | npm dist-tag                                 |
| -------- | ------------------------------ | ----------------------------------------------- | -------------------------------------------- |
| `rc`     | `release/X.Y`                  | `X.Y.0-rc.0`, then `X.Y.0-rc.<max+1>`           | `next`; `latest` for packages with no stable |
| `stable` | `release/X.Y`                  | `X.Y.0`                                         | `latest`, then `next` moved to it            |
| `patch`  | `main`, `X.Y.x`                | conventional commits, no preid, must be a patch | `latest` on `main`, `release-X.Y` on `X.Y.x` |
| `sync`   | `release/X.Y`                  | none                                            | none                                         |
| `resume` | `main`, `release/X.Y`, `X.Y.x` | the newest reachable tag                        | by the same rule as the original event       |

A post-1.0 minor (1.1.0) is cut through `release/1.1` with `event=stable`, possibly with no rc. `patch` on `main` refuses anything but a patch bump, so a `feat` commit on `main` after 1.0 cannot publish a minor by accident. The owner can relax this later (section 12).

### 6.2 Job settings

```yaml
on:
  workflow_dispatch:
    inputs:
      event:
        type: choice
        options: [rc, stable, patch, sync, resume]
      dry-run:
        type: boolean
        default: true

permissions:
  contents: write # release commit, tags, GitHub releases, sync branch
  pull-requests: write # sync pull request
  id-token: write # npm OIDC
  actions: write # dispatch docs.yml

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    # npm's trusted publisher names this environment, and the environment's
    # branch policy admits main, release/* and [0-9]*.x only. RELEASE_SSH_KEY
    # lives in it.
    environment: release
    env:
      HUSKY: '0'
      NX_NO_CLOUD: 'true'
      NX_DAEMON: 'false'
```

### 6.3 Steps

1. Checkout over SSH with `RELEASE_SSH_KEY`, `fetch-depth: 0`, `filter: tree:0` (unchanged).
2. Setup Node and the npm >= 11.5.1 check (unchanged).
3. `npm ci`, Playwright install (unchanged).
4. `node tools/release/plan.mjs`: reads `event`, `GITHUB_REF_NAME`, local and remote tags and `npm view` for every package, and writes `version`, `dist_tag`, `push_refs` and `line` to `GITHUB_OUTPUT`. It runs the checks of section 5.1 and fails with one sentence per broken check. Unit tests in `tools/repo-checks` cover the ref and event table, `sort -V` ordering past rc.9, the line guard and the 1.0 case.
5. For `sync`: the merge script of 5.3 and `gh pr create`, then stop.
6. For `resume`: the steps of 5.8, then stop.
7. Verify gate and packaging check (unchanged; the `release-verify-gate.test.ts` invariant still holds).
8. Configure git (unchanged).
9. For `stable`: create `X.(Y-1).x` if absent.
10. `npx nx release version "$VERSION"` (plus `--dry-run`). For `patch` the plan step first runs `nx release version --dry-run` with no specifier, reads the proposed version, rejects anything but a patch of the line, and passes that version explicitly from here on. The changelog subcommand needs an explicit version.
11. `npx nx release changelog "$VERSION" --git-commit --git-tag --git-push --git-push-args="$PUSH_REFS"` (plus `--dry-run`). `PUSH_REFS` is `HEAD:refs/heads/<branch>` for every event and adds `HEAD:refs/heads/main` for `stable`.
12. For `stable`: `gh release edit "$TAG" --latest`. For `patch` on `X.Y.x`: `--latest=false`, then `--latest` on the newest stable tag.
13. `npx nx release publish --tag "$DIST_TAG"` (skipped on dry run).
14. Dist-tag reconcile (5.2 step 6, 5.4 step 8). Non-fatal, prints commands on failure.
15. For `stable`: commit the archive pin to `main` and push through the deploy key.
16. `gh workflow run docs.yml --ref main` (unchanged).
17. For `stable`: `git push origin --delete release/X.Y`.

The dry run prints the plan step's outputs, the nx version and changelog previews, and the dist-tag each package would get. It never calls `nx run <project>:nx-release-publish` (L11).

### 6.4 Copies of the workflow

`release.yml` runs from the dispatched ref, so `main`, every `release/X.Y` and every `X.Y.x` carry the same file. The file lands on `main` first, `release/0.4` receives it through a sync, and `X.Y.x` inherits it from `main` at creation. A repo-check holds `tools/release/plan.mjs`'s event table against the workflow's `choice` options.

## 7. Docs changes

### 7.1 `docs.yml`

The workflow keeps running on `main` only, because the `github-pages` environment admits `main` only and one deployment replaces the whole site.

1. Root: in `final` and `retired`, the newest stable `@nexusdi/core@X.Y.Z` tag across all tags (or `root.sha`), built in a worktree with its own `npm ci`. This is today's step, unchanged.
2. `/next/`: the highest `release/*` branch from `git ls-remote --heads origin 'refs/heads/release/*'` that is ahead of `main`. With none, `main` itself. Built in a worktree with its own `npm ci`, `DOCS_BASE_PATH=/next` and `DOCS_CHANNEL=next`. The step prints the branch and SHA it used.
3. Archives: `apps/docs/archives.json` lists pinned lines, `{ "line": "0.3", "kind": "snapshot", ... }` first, then `{ "line": "0.4", "tag": "@nexusdi/core@0.4.3" }` once 0.5 is stable. The stable job updates the pin. This replaces the hard-coded `docs-snapshot-0.3` handling with the libraries repo's archive model, and `/v0.3/` keeps its retention rule.
4. The concurrency group `pages` stays, so a docs run started by a version-branch push and one started by a release queue behind each other.

### 7.2 `docs-next.yml` (new, on every `release/*` branch)

```yaml
on:
  push:
    branches: ['release/**']
    paths: [same list as docs.yml]
permissions:
  actions: write
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - run: gh workflow run docs.yml --ref main
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
```

A `workflow_dispatch` created with the job token starts a run [15]. The deploy key's release pushes to `release/X.Y` trigger this workflow too, so `release.yml`'s own docs dispatch is a second trigger that the `pages` concurrency group absorbs.

### 7.3 Checks and spec

- `docs-trigger.ts`: keep the `main` and no-tags rules. Add a rule that `docs-next.yml` exists, triggers on `release/**` with the same paths, and only dispatches `docs.yml` on `main`.
- `deploy-config.mjs`: `rc` and `final` stay. The modes describe what the root shows; the `/next/` source moves out of the mode and into step 7.1.2.
- Docs spec §15.1 and §15.3 say `/next/` builds from `main`. This spec changes that to "the active `release/*` branch, else `main`". The owner amends the docs spec in the same pull request as `docs.yml`.

## 8. `RELEASING.md` changes

1. Replace "Cutting a release" and "Release candidates" with the event table of 6.1 and the runbook of section 5. Remove the `patch` graduation advice (L4 shows it publishes 0.3.3 from the 0.4 branch) and the claim that an empty specifier continues an rc series (L3 shows it publishes a stable).
2. Correct "each package still gets its own `{projectName}@{version}` tag ... and GitHub release". A fixed group gets one tag, `@nexusdi/core@X.Y.Z`, and one GitHub release (L1, L9).
3. Trusted publisher table: environment `release`, "Allow npm dist-tag" on. Add the new-package bootstrap of section 9 step 6.
4. "Repository setup": add the two new rulesets, the `release` environment and the advanced CodeQL workflow. Record that `RELEASE_SSH_KEY` is an environment secret.
5. "The docs site redeploys after a publish": add `docs-next.yml`.
6. "If a release fails": the partial-failure table of 5.9 and `event=resume`.
7. A "Branches" section: the table of 4.1 and the sync procedure.

## 9. Migration from today

Order matters. Each step leaves every release path working or explicitly blocked.

1. Pull request on `main`: `release.yml` (events, plan script, `environment: release`, `HUSKY=0`, concurrency), `tools/release/plan.mjs` and its tests, `ci.yml` push branches `main`, `release/**`, `[0-9]*.x`, a `codeql.yml` advanced setup on the same branches, `docs.yml` (7.1), `docs-next.yml`, `docs-trigger.ts`, `archives.json`, `.gitattributes`, the hook change of 4.6 and the `RELEASING.md` rewrite. `main` stays on its current nx config (independent, one package), because `main` only releases 0.3.x until promotion. The tag pattern on `main` is already `@nexusdi/core@{version}` in effect: `{projectName}` resolves to `@nexusdi/core` for an independent group.
2. GitHub settings (owner): create the `release` environment and move `RELEASE_SSH_KEY` into it; add the "Release branches" and "Maintenance branches" rulesets; switch CodeQL from default setup to the advanced workflow.
3. npm (owner): add environment `release` and the dist-tag permission to `@nexusdi/core`'s trusted publisher. Step 1 must be on `main` first, or a 0.3.3 hotfix would fail OIDC.
4. Rename `feat/core-0.4` to `release/0.4` in GitHub. PR #60 closes because its head branch was renamed; that is the intended end of #60, since `main` receives 0.4 by the stable fast-forward. #61 and #62 retarget to `release/0.4`. PR #60 lists 100 commits because the API caps the list; the branch is 268 commits ahead. Local worktrees: `git branch -m feat/core-0.4 release/0.4 && git branch -u origin/release/0.4`, and the same for any branch based on it that tracks the old name.
5. Sync `release/0.4` with `main` (first `event=sync`), then a pull request on `release/0.4` with the nx.json change of 4.4. The sync brings `release.yml` and the rest of step 1.
6. Bootstrap the packages that are not on npm (six today, eight if #61 and #62 land before rc.0). For each one the owner publishes a placeholder locally: `npm publish --access public --no-provenance --tag bootstrap --otp=<code>` at version `0.0.0-bootstrap.0`, checks `npm view <pkg> dist-tags`, configures the trusted publisher as in step 3, and deprecates the placeholder with `npm deprecate`. rc.0's reconcile step then points `latest` at the rc for every package with no stable version.
7. Decide whether #61 and #62 land before rc.0. The fixed group publishes every package under `libs/`, so a package merged after rc.0 first appears at its rc.N.
8. Dependabot PRs #41 to #59 stay on `main` as 0.3 maintenance and reach `release/0.4` through syncs.
9. Docs: a pull request on `main` sets `deploy.json` to `rc` just before rc.0. `/next/` then builds from `release/0.4`.
10. `event=rc` with `dry-run: true` on `release/0.4`. Check the version `0.4.0-rc.0`, the tag `@nexusdi/core@0.4.0-rc.0`, one GitHub prerelease and the dist-tag per package. Then the real run.

## 10. Red-team walkthrough

An architect pass proposed three workflows (section 11). A tech-lead pass walked each one through rc.0, rc.N, a 0.3.x hotfix during the RC, 0.4.0, 0.4.1 and 0.5.0-rc.0, and checked 1.0.0-rc.0. The chosen workflow is the architect's option A with the amendments below. Each row names the failure the walk found and the part of this spec that prevents it.

| Step            | Failure found                                                                                                                                   | Severity | Prevented by                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| rc.0            | The `{projectName}@{version}` pattern writes a literal `{projectName}@0.4.0-rc.0` tag, and rc.1 resolves 0.3.2 again (L1).                      | blocker  | Literal pattern `@nexusdi/core@{version}` (4.4), before rc.0.                      |
| rc.0            | Per-project GitHub releases target one tag and overwrite each other (L9).                                                                       | major    | One workspace-level GitHub release (4.4).                                          |
| rc.0            | A per-package `--projects` publish loop fails on a fixed group (L10).                                                                           | blocker  | One group publish with `--tag next`, then a dist-tag reconcile (5.2).              |
| rc.0            | Six packages do not exist on npm, so no trusted publisher can be configured for them.                                                           | blocker  | Placeholder bootstrap (9.6).                                                       |
| rc.0            | A placeholder holding `latest` would make `npm i @nexusdi/<new>` install it.                                                                    | major    | Reconcile points `latest` at the rc for every package with no stable (5.2 step 6). |
| rc.0            | Adding `environment: release` to the trusted publisher before `main`'s workflow uses it breaks a 0.3.x hotfix.                                  | major    | Migration order (9.1 before 9.3).                                                  |
| rc.N            | `prerelease` without preid gives `0.3.3-0`; an empty specifier gives stable `0.4.0` (L3).                                                       | blocker  | rc versions are explicit (5.2 step 1).                                             |
| rc.N            | A re-dispatch after a failed publish would compute rc.N+1 and skip rc.N on npm.                                                                 | major    | `rc` refuses while the newest rc is unpublished; `resume` finishes it (5.1, 5.8).  |
| rc.N            | rc.10 sorts below rc.9 lexically.                                                                                                               | minor    | `sort -V`, with a unit test (6.3 step 4).                                          |
| rc.N            | Two dispatches interleave.                                                                                                                      | minor    | `concurrency: release` (5.10).                                                     |
| 0.3.3 during RC | A cherry-picked fix gets a new SHA and appears twice in the 0.4.0 changelog.                                                                    | minor    | Sync by merge (5.3): the original commit becomes reachable from 0.3.3.             |
| 0.3.3 during RC | Nothing runs CI, CodeQL or Dependabot on `release/0.4` pushes.                                                                                  | major    | `ci.yml` and `codeql.yml` on `release/**` and `[0-9]*.x`; Dependabot through sync. |
| 0.3.3 during RC | A conflict the auto-merge cannot resolve has no landing path: `release/*` rebase-only refuses a merge commit.                                   | blocker  | Sync pull requests with the merge method allowed on `release/*` (4.2, 5.3).        |
| 0.4.0           | `patch` from rc.N gives 0.3.3 (L4).                                                                                                             | blocker  | Stable version is explicit (5.4 step 4).                                           |
| 0.4.0           | A rebase-merge of the version branch strands every rc tag and the stable tag; the next fix on `main` proposes 0.4.0 again (L8).                 | blocker  | Promotion by atomic fast-forward push, no rewritten commits (5.4 step 5).          |
| 0.4.0           | Fast-forwarding `main` before tagging leaves 0.4 code on `main` at 0.3.3; a `patch` in that window would publish 0.4 code as 0.3.4 to `latest`. | blocker  | Commit, tag and both branch updates in one atomic push (L12, 5.4 step 5).          |
| 0.4.0           | The verify gate omits `workflows` and `format`; a bypassing push could turn `main` red and block every strict-check PR.                         | major    | Stable requires the four required checks green on the exact SHA (5.1).             |
| 0.4.0           | `main` moves between plan and push.                                                                                                             | minor    | The atomic push is rejected and nothing changes; sync, then dispatch again.        |
| 0.4.0           | The push event's docs run builds the root from the newest stable tag before 0.4.0 exists.                                                       | major    | The tag travels in the same push; `final` lands on `release/0.4` beforehand (5.4). |
| 0.4.0           | Union-less changelog merges drop the 0.3.3 section.                                                                                             | minor    | `merge=union` on `libs/*/CHANGELOG.md` (4.5).                                      |
| 0.4.0           | Moving `next` to 0.4.0 needs OIDC dist-tag rights.                                                                                              | major    | The 2026-09-30 permission (4.3); non-fatal step that prints commands.              |
| 0.4.0           | The husky hook refuses the sync merge locally and in CI.                                                                                        | minor    | `HUSKY=0` in CI; the hooks allow merges on `sync/*` (4.6).                         |
| 0.4.1           | none. L7 gives 0.4.1; the line guard refuses a 0.5.0 from `main`.                                                                               | none     | Line guard (5.1).                                                                  |
| 0.3.4           | A `0.3.x` dist-tag is a semver range and npm rejects it [22].                                                                                   | blocker  | Dist-tag `release-0.3` (5.6).                                                      |
| 0.3.4           | `make_latest: legacy` may mark 0.3.4 as the repository's latest release.                                                                        | major    | `gh release edit` fix-up (5.6 step 4).                                             |
| 0.3.4           | `0.3.x` runs its own copy of `release.yml`.                                                                                                     | major    | The workflow lands on `main` before `0.3.x` is cut (9.1).                          |
| 0.5.0-rc.0      | The docs only know the 0.3 snapshot as an archive; no `/v0.4/` path exists.                                                                     | major    | `archives.json` pins (7.1.3), before 0.4.0.                                        |
| 0.5.0-rc.0      | `/next/` built from `main` would show 0.4 docs during the 0.5 RC.                                                                               | major    | `/next/` from the active `release/*` branch (7.1.2).                               |
| 1.0.0-rc.0      | No relative specifier reaches 1.0.0-rc.0 under the zero-major remap (L5).                                                                       | blocker  | Version from the branch name `release/1.0` (5.2).                                  |
| Migration       | Renaming `feat/core-0.4` closes PR #60 and leaves local worktrees tracking a missing branch.                                                    | minor    | #60 closing is intended; `git branch -m` and `-u` per worktree (9.4).              |

A lab experiment during the red-team pass ran `nx run <project>:nx-release-publish --dryRun`, which sent a real publish request; the registry rejected it for missing credentials (L11). The workflow never uses that command, and section 6.3 says so.

## 11. Rejected options

- Long-lived `next` as the default branch, with `main` as a fast-forward-only pointer (semantic-release style). Making `next` the default moves the `~DEFAULT_BRANCH` ruleset off `main`. Security updates and CodeQL default setup follow the default branch, so the stable line loses them. A hotfix on `0.3.x` either stops `main` from being an ancestor of `next` or leaves `main` behind the published `latest`. `main` stops being the working trunk the libraries repo uses.
- Promotion by rebase-merging the version branch into `main` (PR #60 as it stands). GitHub's rebase-merge rewrites every commit [9], so the rc tags and any stable tag cut on the branch become unreachable from `main` (L8). With a hotfix on `main`, the rebase conflicts on every rc release commit. A manual rebase that drops those commits rewrites about 268 commits per minor, needs force-push rights on `release/*`, and leaves rc provenance pointing at commits `main` never contains.
- Cutting the stable on `main` after a rebase-merge. `main` holds 0.4 code at 0.3 versions between the merge and the release, and a `patch` run in that window publishes breaking code as 0.3.4.
- Trunk with prerelease tags on `main` (React, Vite, Nx). The owner's rule excludes it, and changesets documents why: prereleases on the default branch block stable fixes [7].
- `releaseTag.checkAllBranchesWhen`. Explicit versions make it unnecessary, and an all-branches lookup lets `0.3.x` tags into 0.4 changelogs.
- `releaseTag.pattern: "v{version}"`, nx's fixed default. It hides every existing `@nexusdi/core@*` tag, so the first run would fall back to the version on disk and build a changelog from the first commit, and `benchmarks.yml` and the docs root lookup would need new patterns.
- Cherry-picking `main` fixes into the version branch. Each fix appears twice in the stable changelog, and promotion still needs `main` merged in.
- A Dependabot `target-branch` entry per version branch. It needs a config edit for every line, and syncs already carry `main`'s updates.
- A `0.3.x` npm dist-tag. npm rejects semver ranges as tag names [22].
- Per-package publishing through `nx release publish --projects` (L10) or `nx run <project>:nx-release-publish` (L11).

## 12. Owner decisions

GitHub settings and branch operations, in migration order:

1. Create the `release` environment with deployment branches `main`, `release/*`, `[0-9]*.x`, and move `RELEASE_SSH_KEY` into it. Delete the unused `Main` environment.
2. Create the "Release branches" ruleset (`release/*`, merge and rebase allowed) and the "Maintenance branches" ruleset (`[0-9]*.x`, rebase only), both with the four strict required checks, CodeQL and `DeployKey` bypass.
3. Switch CodeQL from default setup to the advanced `codeql.yml` workflow.
4. Keep `main` as the default branch.
5. On npm, add environment `release` and the "Allow npm dist-tag" permission to `@nexusdi/core`'s trusted publisher, after the new `release.yml` is on `main`.
6. Rename `feat/core-0.4` to `release/0.4`. This closes PR #60 and retargets #61 and #62.
7. Publish the placeholder for each new package from a local machine, configure its trusted publisher, and deprecate the placeholder.

Policy choices:

8. Whether #61 and #62 land before rc.0.
9. After 1.0, whether `main` may publish a minor from conventional commits. This spec says no: minors go through `release/X.Y`.
10. The maintenance dist-tag name. This spec uses `release-X.Y`.
11. The docs spec §15 amendment: `/next/` builds from the active `release/*` branch.

## 13. Unverified, and how to check before rc.0

1. The deploy key pushing `HEAD:release/X.Y HEAD:main` plus a tag atomically under both rulesets. L12 printed the command only. Check in a throwaway GitHub repository with copies of both rulesets and a bypassing deploy key: push once with `main` as an ancestor, then once after moving `main`, and confirm the second push changes no ref.
2. OIDC `npm dist-tag add` with the 2026-09-30 permission, from a non-default branch in the `release` environment. Check with a probe tag on `@nexusdi/core@0.3.2`, added and removed by a scratch dispatch.
3. Trusted publishing with `environment: release` from a branch dispatch. Check by publishing one bootstrapped package's placeholder through `event=resume`, or a probe version of a scratch package configured the same way.
4. `make_latest: legacy` ordering for a backport. The `gh release edit` fix-up makes the answer non-blocking.
5. Whether the registry sets `latest` on a new package first published with `--tag bootstrap`. The bootstrap step reads `npm view <pkg> dist-tags` and the reconcile step corrects either outcome.
6. The `/next/` worktree build time inside `docs.yml` with its own `npm ci`. Check with a build-only run of the new `docs.yml` on a branch.
7. Whether CodeQL default setup treats a ruleset-protected branch as protected. Moot once the advanced workflow lands.

## References

1. Angular, branches and versioning: https://github.com/angular/angular/blob/main/contributing-docs/branches-and-versioning.md
2. TypeScript release process: https://github.com/microsoft/TypeScript-wiki/blob/main/TypeScript's-Release-Process.md
3. React versioning policy: https://react.dev/community/versioning-policy
4. Vite releases: https://vite.dev/releases
5. Nx, manage releases: https://nx.dev/docs/features/manage-releases
6. semantic-release workflow configuration: https://semantic-release.gitbook.io/semantic-release/usage/workflow-configuration
7. changesets prereleases: https://github.com/changesets/changesets/blob/main/docs/prereleases.md
8. release-please customizing: https://github.com/googleapis/release-please/blob/main/docs/customizing.md
9. GitHub, about merge methods: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github
10. GitHub, available rules for rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
11. GitHub, renaming a branch: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch
12. Dependabot options, target-branch: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#target-branch
13. GitHub, code scanning setup types: https://docs.github.com/en/code-security/concepts/code-scanning/setup-types
14. GitHub REST, create a release: https://docs.github.com/en/rest/releases/releases#create-a-release
15. GitHub, GITHUB_TOKEN: https://docs.github.com/en/actions/concepts/security/github_token
16. GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
17. npm trusted publishers: https://docs.npmjs.com/trusted-publishers
18. setup-npm-trusted-publish: https://github.com/azu/setup-npm-trusted-publish
19. npm dist-tag (v10): https://docs.npmjs.com/cli/v10/commands/npm-dist-tag
20. GitHub changelog, opt-in dist-tag permissions for npm trusted publishing: https://github.blog/changelog/2026-09-30-opt-in-dist-tag-permissions-for-npm-trusted-publishing/
21. Nx, nx.json reference: https://nx.dev/docs/reference/nx-json
22. npm dist-tag (v11): https://docs.npmjs.com/cli/v11/commands/npm-dist-tag
