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

### 2. Check that main allows the release workflow to push

`nx release` commits the version bump and pushes tags straight to `main`,
authenticated as the default `GITHUB_TOKEN` this workflow runs with. If a
branch protection rule on `main` requires every change to go through a
reviewed pull request, that push is rejected. Either exempt the workflow's
actor from that rule, or switch this step to a deploy key the way the
libraries repo this tooling is modeled on does (see its
`.github/workflows/release.yml` for the `ssh-key` pattern) — that decision is
the owner's to make, since it depends on how `main` is actually protected here.

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
- **The version/tag step fails to push** — see "Check that main allows the
  release workflow to push" above.
