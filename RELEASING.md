# Releasing

Publishing runs through the **Release** workflow
(`.github/workflows/release.yml`), authenticated with npm **trusted publishing**
over OIDC. There is no `NPM_TOKEN` secret in this repository and there should
never be one.

## Why no token

npm is retiring the credential CI used to rely on:

- Since **2026-07-31**, bypass-2FA granular access tokens can no longer change
  package access, maintainers, or trusted publishing configuration.
- **Direct publish** from a bypass-2FA token is targeted for removal in
  **January 2027**.

A token that _requires_ 2FA is not an alternative — 2FA is an interactive
challenge, so unattended automation cannot answer it. Trusted publishing solves
this by removing the long-lived credential entirely: the npm CLI exchanges the
GitHub Actions OIDC token for publish rights that are short-lived and scoped to
this repository and this workflow filename.

It also means provenance is generated automatically, with no `--provenance` flag.

## One-time setup (the owner must do this before the first release)

### 1. Configure a trusted publisher for @nexusdi/core

On npmjs.com, under _Settings → Trusted Publisher_ for `@nexusdi/core`:

| Field             | Value             |
| ----------------- | ----------------- |
| Organization/user | `NexusDI`         |
| Repository        | `core`            |
| Workflow filename | `release.yml`     |
| Environment       | _(leave empty)_   |
| Allowed actions   | **`npm publish`** |

Two things to get right:

- The workflow filename is matched **by name**, not path. Renaming
  `release.yml` breaks publishing until this config is updated.
- Configurations created after 2026-05-20 must explicitly select at least one
  allowed action. Pick `npm publish`. Do **not** select stage-only —
  `nx release publish` runs a plain `npm publish` and a stage-only publisher
  would reject it.

If `@nexusdi/core` has never been published before, npm will not let you
configure a trusted publisher for a package that does not exist yet. Bootstrap
it with one manual publish first, from a maintainer's machine with their own
2FA:

```bash
npm login                       # if not already authenticated
npx nx build core
npm run verify:packaging        # same check CI runs before publishing
cd libs/core
npm publish --access public --no-provenance --otp=<code-from-your-authenticator>
```

`--no-provenance` overrides `publishConfig.provenance: true`, which fails
locally with _"Automatic provenance generation not supported for provider:
null"_ because provenance requires a CI provider — the published version will
have no attestation, which is the one unavoidable cost of bootstrapping, and
every release after it is attested. `--otp` avoids npm's browser auth flow,
which redacts the auth URL to `***` whenever stdout is not a TTY.

Then tag the commit you published from and configure the trusted publisher as
above:

```bash
git tag '@nexusdi/core@<version>' <sha>
git push origin '@nexusdi/core@<version>'
```

`nx release` resolves a package's current version from its tag, and
`releaseTag.pattern` is `{projectName}@{version}`. Without the tag it falls
back to the version on disk and reads conventional commits from the beginning
of history.

### 2. Repository setup — applied configuration

This is done; the `main` ruleset, the deploy key, and npm trusted publishing
are all live. What follows is a factual record of that configuration, kept
here so a change to it is a deliberate diff against a known state rather than
a guess.

`nx release` commits the version bump and pushes tags straight to `main`
(`changelog.projectChangelogs.createRelease: "github"` forces this on — see
nx's `release.js`, `shouldPush`). This repo's `main` ruleset requires a
reviewed pull request, and `github-actions[bot]` cannot be granted a bypass on
a personal repository: the API rejects an `Integration` bypass actor outside
an organisation. A deploy key can bypass, so the release workflow pushes as
one.

**`main` ruleset** (id `6234520`, `gh api repos/NexusDI/core/rulesets/6234520`):

- Rebase-only merges (`allowed_merge_methods: ["rebase"]`), matching
  `.husky/pre-merge-commit`'s assumption.
- 0 required approvals, no code-owner review, no last-push approval.
- Required status checks: `main`, `workflows`, `format`, `packaging` — the
  job ids in `.github/workflows/ci.yml`, all four blocking.
- A `code_scanning` rule for CodeQL, satisfied by this repo's default-setup
  CodeQL scan — no dedicated `codeql.yml` workflow needed.
- One bypass actor: `DeployKey`. There is no `RepositoryRole`/Admin bypass,
  so a failing required check blocks a maintainer's own push the same as
  anyone else's.

**Deploy key**: org-level deploy keys are enabled for `NexusDI`
(`deploy_keys_enabled_for_repositories: true` on the org). The repo carries
one deploy key, titled `release.yml (nx release push)`, with write access
(`--allow-write`). Its private half is the `RELEASE_SSH_KEY` secret that
`release.yml` reads (`ssh-key: secrets.RELEASE_SSH_KEY`).

**npm publishing**: no `NPM_TOKEN` secret exists on this repo. Publishing
goes through OIDC trusted publishing, configured in section 1 above.

#### Rotating the release deploy key

```bash
ssh-keygen -t ed25519 -f release-deploy-key -N "" -C "nexusdi-core release workflow"

# Public half: added to the repo as a deploy key with write access.
gh repo deploy-key add release-deploy-key.pub \
  --repo NexusDI/core \
  --title "release.yml (nx release push)" \
  --allow-write

# Private half: added as the secret release.yml reads. The secret name must
# match what release.yml reads (RELEASE_SSH_KEY) — it is matched by name, not
# by which key generated it.
gh secret set RELEASE_SSH_KEY --repo NexusDI/core < release-deploy-key

# Only the private key needs to leave your machine as a secret; delete both
# local copies once the two commands above succeed.
rm release-deploy-key release-deploy-key.pub
```

Then remove the old key — `gh api repos/NexusDI/core/keys` lists ids,
`gh api --method DELETE repos/NexusDI/core/keys/<old-id>` removes one. GitHub
does not retire a replaced key on its own.

#### npm trusted publisher

Covered above in "1. Configure a trusted publisher for @nexusdi/core" — do
that too before the first release.

## In-workspace dependencies are pinned exactly

`version.versionPrefix` is `""`, so a dependency between two packages in this
workspace would be written as `"@nexusdi/other": "1.2.3"` rather than
`^1.2.3`. There is only one published package today, so this has no visible
effect yet, but it is what a second library plugs into without a config
change: an exact pin never matches the next version, so
`preserveMatchingDependencyRanges` never preserves it and nx rewrites it
during the version step of the same run.

## Cutting a release

1. Land the work on `main`. Commits must be
   [conventional](./CONTRIBUTING.md) — the version bump is inferred from them.

   **Breaking changes need a `BREAKING CHANGE:` footer.** Without it a breaking
   change is inferred as a minor bump.

2. Run **Release** with `dry-run: true`. Check the proposed version, changelog
   entries and tag name.

3. Re-run with `dry-run: false`.

### Releasing a subset

`projects` takes a comma-separated list and defaults to empty, which releases
everything affected. Names are the bare form used as commit scopes (`core`).

```
projects: core
```

The list is resolved against the project graph before anything is versioned,
so a name that is not released here fails the run immediately and prints the
releasable names.

The verify gate follows the same resolved list. It runs `lint`, `test`,
`build` and `typecheck` — the target list CI runs on a pull request — over the
released packages, what they are compiled against, and every project that
depends on them, transitively.

## Release candidates

0.4 ships as a series of release candidates before the stable tag. This uses
`nx release`'s own prerelease support (`specifier`/`preid` inputs on the
Release workflow) rather than a separate process — verified locally with
`nx release <specifier> --preid <preid> --dry-run --skip-publish` for both a
stable and a prerelease specifier before writing this section, not guessed
from the docs.

**Version numbers, exactly as nx computes them.** `adjustSemverBumpsForZeroMajorVersion`
is on (nx.json), which remaps `major`→`minor` and `premajor`→`preminor` while
the package is on a `0.x` version (`node_modules/nx/dist/src/command-line/release/utils/semver.js`,
`adjustSpecifierForZeroMajorVersion`) — `patch`/`prepatch`/`prerelease` are
left alone. So from `0.3.1`, requesting `premajor` is what lands on the next
`0.4.0`-line version, not `major`. And prerelease numbering in this nx/semver
version starts at **`.0`**, not `.1`: `premajor --preid rc` from `0.3.1`
resolves to `0.4.0-rc.0` (checked directly with `--dry-run`), not
`0.4.0-rc.1`. Plan the series as rc.0, rc.1, rc.2, ... — the workflow does not
try to renumber this to start at 1.

**1. Cut `0.4.0-rc.0`** — the first release candidate. Run **Release**:

```
specifier: premajor
preid: rc
dry-run: true     # then false once the preview looks right
```

**2. Cut `0.4.0-rc.1`, `rc.2`, ...** — further candidates, once more commits
have landed. Run **Release** with:

```
specifier: prerelease
dry-run: true     # then false
```

(`preid` is ignored here — `semver.inc` carries the existing `rc` identifier
forward on its own; you only need `preid` to start a new prerelease series.)
Leaving `specifier` empty also works for this step: conventional-commits mode
sees the current version is already a prerelease and keeps it a prerelease
(`derive-specifier-from-conventional-commits.js`: "Always assume that if the
current version is a prerelease, then the next version should be a
prerelease"). Prefer the explicit `prerelease` specifier anyway — it says
what is happening without having to know that rule.

**3. Promote `rc.N` to stable `0.4.0`.** Run **Release** with:

```
specifier: patch
dry-run: true     # then false
```

`patch` is unaffected by the zero-major remap (it stays `patch`), and
incrementing `patch` on a prerelease of `X.Y.Z` graduates it to the plain
`X.Y.Z` instead of bumping further — this is `node-semver`'s own behavior,
not something this repo adds. Nx's release notes call this out directly:
"Users must manually graduate from a prerelease to a release by providing an
explicit specifier." `minor` or `major` would also graduate it, but to a
_different_ `X.Y.Z` than the one the rc series was validating — use `patch`
to land on exactly the version you already shipped candidates of.

**npm dist-tag.** The Release workflow's "Resolve npm dist-tag" step reads
the version `nx release` just wrote and tags the npm publish itself:
containing a `-` (i.e. any prerelease) publishes with dist-tag `next`;
anything else publishes `latest`. This is not automatic in nx/@nx/js — without
an explicit `--tag`, `nx release publish` falls through to npm's own default
of `latest` regardless of the version's shape
(`@nx/js/src/utils/npm-config.js`, `getNpmTag`) — so an rc left untagged would
otherwise become the default install for everyone running `npm install
@nexusdi/core`. `npm install @nexusdi/core@rc` (or `@next`) is how a
consumer opts into a candidate; `npm install @nexusdi/core` never resolves to
one.

**GitHub release.** No extra flag needed: nx derives `isPrerelease` from the
version's own shape (`semver.prerelease(version) !== null`,
`utils/shared.js`) and marks the GitHub release a prerelease automatically
whenever the version has one — confirmed in
`utils/remote-release-clients/github.js`, `remoteReleaseOptions.prerelease`.

## Verifying a release worked

```bash
npm view @nexusdi/core version
npm view @nexusdi/core dist.attestations   # non-null means provenance landed
npm view @nexusdi/core repository          # should point at NexusDI/core
```

`dist.attestations` returning `null` means the package published without
provenance — the OIDC exchange did not happen. Check that `id-token: write` is
still granted and that the trusted publisher's workflow filename still matches.

## If a release fails

- **`ENEEDAUTH` / 401 on publish** — usually the trusted publisher is not
  configured, or its workflow filename no longer matches.
- **Publishing works but `dist.attestations` is `null`** — the CLI fell back to
  something other than OIDC. Check the npm version guard step passed.
- **`nx release` proposes the wrong version** — a breaking change is missing
  its `BREAKING CHANGE:` footer. Fix the version by hand for that release
  rather than publishing a wrong one; npm versions are immutable.
- **The version/tag step fails to push** — the deploy key is missing, revoked,
  or not listed as a ruleset bypass actor. See "Repository setup — applied
  configuration" above.
