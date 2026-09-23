# Contributing

Thank you for your interest in contributing to NexusDI.

## Development setup

```bash
nvm use          # reads .nvmrc; Node 24.20.0
npm ci
```

```bash
npx nx run-many -t lint test build typecheck   # the same gate CI runs
npx nx build core
npx nx test core
npx nx lint core
```

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to ensure a clear and consistent commit history.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Scopes

A scope for a package must be that package's Nx project name with the
`@nexusdi/` prefix stripped -- nothing else. Nx matches commit scopes against
project names, so a scope that isn't a project name is attributed to no
project at all and the commit is silently downgraded to a `patch` bump.
Nothing errors, you just get the wrong version, and published versions cannot
be taken back. Run `npx nx show projects` if you are unsure of a name.

Package scopes:

- **core**: Changes to the `@nexusdi/core` library

Repository scopes (these are not projects and never bump a package on their
own):

- **examples**: Changes to examples/react-ssr and examples/react-ssr-e2e
- **ci**: Changes to CI workflows
- **deps** / **deps-dev**: Changes to dependencies
- **repo**: Repository-wide chores (tooling, nx.json, tsconfig.base.json, ...)
- **release**: Release tooling and this runbook
- **specs**: Changes under a specs/ or docs/specs directory, if one exists
- **docs**: Changes to documentation

The list is enforced. `commitlint.config.js` carries it as the `scope-enum`
rule, and the commit-msg hook rejects anything outside it. It is a static list
on purpose -- computing the Nx project graph on every commit would make the
hook unusably slow -- so `tools/repo-checks` fails the build if a new
releasable project is added without a matching entry.

### Version Bumps

Not every type bumps a version. Nx's conventional-commits config maps each
type to a `semverBump`:

- **feat** -- minor
- **fix** -- patch
- Everything else (**perf**, **refactor**, **docs**, **build**, **chore**,
  **test**, **style**, **ci**, **revert**) -- none

Only `feat` and `fix` move a version. This compounds with the scope rule
above in the worst possible way: a `fix` whose scope isn't a project name
isn't rejected and isn't ignored -- Nx falls back to attributing it by the
files it touched, and an infrastructure commit almost always touches root
files (`package.json`, workflow configs, `nx.json`), which belong to every
package. Use `ci` or `chore` for workflow, tooling and repo-config changes,
never `fix`, unless the change is actually scoped to `core`.

### Examples

```bash
feat(core): add support for circular dependency detection
fix(core): resolve issue with parameter decorators in strict mode
docs: update README with new API examples
chore: update dependencies to latest versions
```

### Using Commitizen

```bash
npm run commit
```

This guides you through creating a properly formatted commit message.

### A note on `typecheck`

`nx run-many -t typecheck` covers `core` and `examples/react-ssr`. Nx infers a
`typecheck` target from each project's tsconfig.json and runs `tsc --build`
against it; there is no separate `check` target in this repository, because
nothing here builds through a tool (like Astro) that needs one.

### Running `nx g`

Nx generators rewrite root config beyond the project they create. Devkit's
`writeJson` is `JSON.stringify`, so any generator that touches `nx.json`
rewrites the whole file and drops its comments. Scaffolding a publishable
library also adds `release.version.preVersionCommand`, a `verdaccio`
devDependency, a `local-registry` target in root `package.json`, and
`.verdaccio/config.yml`. Nx offers no option to suppress any of it.

After running a generator, diff the files outside the new project and restore
the root config, re-applying by hand only what the generator legitimately
added. `tools/repo-checks` fails the build if any of that collateral is left
in, so `nx run-many -t test` will tell you before CI does.

### Formatting

CI runs `npx prettier --check .` over the whole tree in its own job, so an
unformatted file fails the build whether or not your change touched it. Run
`npx prettier --write .` before pushing, or let your editor format on save.

`.git-blame-ignore-revs` lists the formatting-only commits. GitHub's blame view
applies it on its own; your clone does not until you point git at it:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

### Commit Linting

All commit messages are linted using commitlint via a Husky `commit-msg`
hook. If your commit message doesn't follow the convention, the commit is
rejected with an error explaining why.

### Breaking Changes

Version bumps are inferred from these commits, so a breaking change **must**
carry a `BREAKING CHANGE:` footer — describing it in prose is not enough and
results in a minor bump for a breaking release. See
[RELEASING.md](./RELEASING.md).

```
feat(core)!: change Nexus.get signature

BREAKING CHANGE: Nexus.get now throws NoProvider instead of returning undefined
```

### Issues

Reference issues in your commit message footer:

```
fix(core): resolve memory leak in nested containers

Closes #123
Fixes #456
```

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes, with tests.
3. Run the gate locally: `npx nx run-many -t lint test build typecheck`.
4. Format: `npx prettier --write .`.
5. Submit a pull request with a clear description. CI runs the same gate,
   plus `npm run verify:packaging` and a workflow-file lint.

## Getting Help

- **Issues**: Use GitHub issues for bug reports and feature requests.
- **Discussions**: Use GitHub Discussions for questions and general
  discussion.
