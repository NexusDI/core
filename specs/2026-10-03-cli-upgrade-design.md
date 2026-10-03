# `nexusdi upgrade`: the 0.4 upgrade command in `@nexusdi/cli`

Status: approved by the owner on 2026-10-03; implementation pending.
Package: `@nexusdi/cli` (`libs/cli`, bin `nexusdi`). It adds the `upgrade` command.
Replaces: the separate package `@nexusdi/codemod` of `specs/2026-09-23-core-0.4-design.md` (section 12, section 13.2, section 14).
Target: `0.4.0-rc.2`. `0.4.0-rc.1` ships without it. Work starts after 2026-10-07.
Plan: `specs/plans/2026-09-23-codemod-0.4.md` is superseded. A new plan, `specs/plans/<date>-cli-upgrade.md`, is written before the build.

## 1. What changes

The planned package `@nexusdi/codemod` (`npx @nexusdi/codemod 0.4`) is not built. The command is `nexusdi upgrade` in the existing `@nexusdi/cli` package. A 0.3 user runs:

```
npx @nexusdi/cli@latest upgrade
```

The command upgrades the `@nexusdi/*` packages and rewrites 0.3 code to the 0.4 API. It runs in a single project or at the root of a monorepo.

What stays from the 2026-09-23 design:

- The transforms, in their order: spec section 13.2, as the plan `specs/plans/2026-09-23-codemod-0.4.md` extends it (eleven transforms, 27 TODO codes, 3 note codes).
- The fixture layout, the fixture harness, the typecheck of every fixture output and the end-to-end test of `examples/react-ssr`: spec section 13.2 "Test strategy" and plan Tasks 10, 23, 24 and 25.
- The TODO marker `// TODO(nexusdi-0.4): <reason> (<code>)` and the codes, which are never renamed or reused.
- The per-file report shape: spec section 13.2 "The report". Section 6 below says how it is grouped.

The migration guide (spec section 13.1) names `npx @nexusdi/cli@latest upgrade` as its first step.

## 2. The steps

`nexusdi upgrade` runs five steps in order.

1. Detect. The command reads the installed version of every `@nexusdi/*` package and reads the package manager from the lockfile (npm, pnpm, yarn or bun). It refuses to run when the git tree is dirty (`--force` overrides) or when the installed versions are inconsistent.
2. Plan. The command picks the target version and lists the migrations between the current and the target version. It prints which packages change and which migrations run. `--dry-run` stops here and also prints the code diff.
3. Upgrade. The command sets every `@nexusdi/*` package to the same target and runs the project's own install once.
4. Migrate. The command runs the migrations in version order and writes a report. A change a migration cannot make gets the marker `// TODO(nexusdi-0.4): <reason> (<code>)`.
5. Verify. The command runs `nexusdi check` for each project that has a root module.

`nexusdi check` does not exist today. The graph CLI spec lists it as out of scope (`specs/2026-09-29-graph-cli-design.md`, "Out of scope" on `release/0.4`), and `libs/cli/src/args.ts` on `origin/release/0.4` accepts only `graph`. It is built before or with `upgrade`, and the plan for `upgrade` schedules it.

## 3. Monorepos

Run at the root of an Nx, Turborepo, Lerna or plain-workspaces repo, the command upgrades every project.

It discovers projects from:

- the `workspaces` field of `package.json` (npm, yarn, bun, Turborepo)
- `pnpm-workspace.yaml`
- the `packages` field of `lerna.json`
- Nx `project.json` projects that have no `package.json` of their own

It updates versions wherever they are declared:

- each `package.json` that lists `@nexusdi/*`
- pnpm catalogs in `pnpm-workspace.yaml`
- the root `package.json` of an integrated Nx repo

Rules for a monorepo run:

- All `@nexusdi/*` packages move to one version repo-wide, because they pin each other as peers.
- The command runs one install, at the root.
- Each project runs only the migrations for its own starting version.
- The codemod uses each project's tsconfig and edits each file at most once.
- The codemod finds code that imports `@nexusdi/*` in projects that have no dependency entry of their own.
- The plan and the report are grouped by project.
- `--projects a,b` filters the run to the named projects.

An Nx `migrations.json`, so that `nx migrate @nexusdi/cli@latest` works, is a later extra. It calls the same migrations.

## 4. State tracking

### 4.1 The applied-migrations record

`.nexusdi/migrations.json` is committed. For each project it lists the ids of the migrations that ran, when they ran, with which CLI version, and the outcome. Later runs read this file and do not infer from package versions. That covers a `package.json` bumped by hand with no codemod run.

### 4.2 The run journal

`.nexusdi/upgrade-run.json` exists only during a run. The command writes it atomically (temp file, then rename) after each step. It holds:

- the starting git HEAD
- backups of every touched `package.json` and lockfile
- the status of each step for each project
- the files each migration has written

### 4.3 Outcomes

- Completed: the record is updated and the journal is deleted.
- Completed with issues: TODO markers remain. The record counts them, and `nexusdi upgrade --status` rescans the code for `TODO(nexusdi-` markers.
- Failed: the journal names the step, the project and the error.
- Aborted: the command catches SIGINT, marks the step aborted and flushes the journal. After a hard kill, a step still marked running counts as aborted.

### 4.4 Recovery

- A new run refuses to start while a journal exists.
- `--resume` continues from the first step that is not done.
- `--abort` restores the `package.json` and lockfile backups, prints the git commands that undo the code changes since the recorded HEAD, and deletes the journal. It does not run those git commands.

### 4.5 Required properties

- Every transform is idempotent. Each fixture test runs the transform twice and expects the same output.
- Each file is written once, after all transforms for it are computed, through a temp file and a rename.

## 5. Pre-releases

Target selection:

- `latest` by default.
- `--next`, short for `--tag next`.
- `--tag <dist-tag>`.
- `--to <exact version>`.

The command orders versions by semver pre-release precedence.

Where the migrations come from:

- The migrations come from the target version. When the target differs from the running CLI's version, the command delegates the run to `@nexusdi/cli@<target>`, the way `ng update` runs the target's schematics.

Migration ids follow versions:

- `0.4.0` takes 0.3 code to the API of the CLI that carries it.
- An RC-to-RC migration such as `0.4.0-rc.1` exists only when an RC breaks the previous RC. It applies only to code already on an earlier RC.
- A 0.3 project that jumps to the final release runs `0.4.0` only.

Direction:

- The command never moves a project downward. When the project is ahead of `latest`, the command says so and suggests `--next`.
- The command never moves a stable project to a pre-release unless `--next`, `--tag` or `--to` is given.
- Undo is `--abort` plus git. There are no down migrations.

## 6. The report

The per-file entries keep the shape of spec section 13.2 (`path`, `transforms`, `todos`, `notes`). The report groups them by project, and its header names the CLI version where the old report named `codemodVersion`. The plan for `upgrade` fixes the exact JSON, and the fixtures' `report.json` files keep the per-file shape.

## 7. ts-morph is an optional peer

`ts-morph` is an optional peer dependency of `@nexusdi/cli`. Only `upgrade` loads it, and when it is missing the command stops with an error that names what to install. This follows how the CLI already treats `@viz-js/viz` and `@resvg/resvg-js` on `origin/release/0.4`:

- `libs/cli/package.json` lists them under `peerDependencies` and marks each optional in `peerDependenciesMeta`.
- `libs/cli/eslint.config.mjs` lists them in `ignoredDependencies`.
- `libs/cli/src/resolve.ts` (`importPeer`) imports a peer from the user's project first and from the CLI's own location second.
- `libs/cli/src/render.ts` (`peers`) imports the peers a format needs and throws one `CliError` with exit code 3. The message names every missing peer, and the fix line is one install command.

`upgrade` adds `ts-morph` to the same three places and reuses `importPeer` and the `CliError` shape.

The design covers `ts-morph` only. The plan for `upgrade` decides whether `jsonc-parser` and `diff`, which the old plan declared as dependencies, load the same way.

A 0.3 user runs `upgrade` through `npx` with no `@nexusdi/core` or `@nexusdi/devtools` installed at 0.4. The CLI currently declares both as required peers, so the plan for `upgrade` must make `upgrade` start without them.

## 8. Changes from the 2026-09-23 codemod plan

The design above wins over `specs/plans/2026-09-23-codemod-0.4.md` and over spec section 13.2, section 12 and section 14 as they stood. Each conflict:

1. Package and bin. The plan builds `libs/codemod`, the Nx project `@nexusdi/codemod`, the bin `nexusdi-codemod` and the commit scope `codemod` (Task 1, Global Constraints). The code goes into `libs/cli` as the `upgrade` command, with the bin `nexusdi` and the commit scope `cli`.
2. Invocation. The plan runs `npx @nexusdi/codemod 0.4 [paths...]`, and the first positional argument picks the migration. The command is `nexusdi upgrade` with no version argument. Detect and Plan pick the migrations from the installed and target versions.
3. Registry key. The plan keys its registry by the minor version `0.4`. Migration ids are full versions (`0.4.0`, `0.4.0-rc.1`), and the command orders them by semver pre-release precedence.
4. Scope. The plan migrates one project: the nearest `package.json` at or above the first tsconfig. The command migrates every project of a monorepo, each from its own starting version, and groups its plan and report by project.
5. The `package-json` transform. The plan's eleventh transform writes `^0.4.0-rc.0` into one `package.json`. The Upgrade step replaces it. The step sets every `@nexusdi/*` package to one target, in every place a version is declared, and runs the install. The transform list in spec section 13.2 and the plan shrinks to ten, and the migrations no longer touch dependency fields.
6. The `tsconfig` flag. The plan takes `--tsconfig <path>` (default `./tsconfig.json`) and follows references from it. The command uses each project's own tsconfig. The plan for `upgrade` says whether `--tsconfig` stays as an override for a single project.
7. Flags. The plan has `--tsconfig`, `--dry-run`, `--report`, `--only` and `--style`. The design lists `--dry-run`, `--force`, `--projects`, `--resume`, `--abort`, `--status`, `--next`, `--tag` and `--to`. The design is silent on `--report`, `--only`, `--style` and the `[paths...]` argument. The plan for `upgrade` carries them over unless one of them clashes with a design flag.
8. `--dry-run`. The plan's flag prints a diff and writes nothing. The design's flag also prints the Plan step, and it stops there.
9. Writes. The plan applies each transform's edits to a file in one pass per transform. The design writes each file once, after all transforms for it are computed, through a temp file and a rename.
10. State. The plan keeps no state between runs and has one JSON report. The design adds `.nexusdi/migrations.json`, `.nexusdi/upgrade-run.json`, the outcomes, `--resume`, `--abort` and `--status` (section 4).
11. Dependencies. The plan declares `ts-morph`, `jsonc-parser` and `diff` as dependencies of `@nexusdi/codemod`, and spec section 13.2 says core's zero-dependency rule does not apply to it. `ts-morph` becomes an optional peer of `@nexusdi/cli` (section 7).
12. Run order against install. The plan recognises the 0.3 API by its imports "whether `@nexusdi/core` resolves to 0.3.1, to a 0.4 workspace source, or to nothing". The command installs the target before it migrates, so `@nexusdi/core` resolves to 0.4 when the transforms run. Recognition by import stays as it is.
13. Verify. The plan ends at the migration and the typecheck of its own fixtures. The command runs `nexusdi check` after the migration (section 2).
14. Release. Spec section 14 publishes `@nexusdi/codemod` with `0.4.0-rc.0` at the version and dist-tag of core. Plan Task 27 and `RELEASING.md` section "1b. Bootstrap @nexusdi/codemod" describe the owner's manual first publish. All of that goes. `@nexusdi/cli` already publishes with core, so `upgrade` needs no bootstrap. The command first ships in `0.4.0-rc.2`.
15. RC breaks. Spec section 14 says an RC that breaks the previous RC includes a matching codemod update. The command answers with an RC-to-RC migration id (section 5), which applies only to code already on an earlier RC.
16. Final condition. Spec section 14 requires "the codemod has been verified against the repo's examples and at least one external codebase". It now requires that the `nexusdi upgrade` command from `@nexusdi/cli` has run against at least one external codebase.
17. README. Plan Task 26 writes `libs/codemod/README.md`. The documentation of the codes and the usage goes to the CLI's README and to the docs site. The README of `@nexusdi/cli` stays a short npm page.
18. Packaging check. Spec section 17 and `scripts/verify-packaging.mjs` pack `@nexusdi/codemod` and check that "the codemod's bin runs". The check packs `@nexusdi/cli` and runs `nexusdi upgrade --help`.
19. Codes. Spec section 13.2 on this branch lists 26 TODO codes and 1 note code. The plan lists 27 and 3 (`eager-construction`, `vite-decorator-plugin` are added to the notes). The plan's lists stand. The package that exports `TODO_CODES` and `NOTE_CODES` is `@nexusdi/cli`.
