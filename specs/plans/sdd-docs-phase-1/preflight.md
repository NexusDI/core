# docs-phase-1 preflight (2026-10-01)

Read-only scan. Refs at scan time: origin/main 7646ad4, origin/release/0.4 20d5e27 (f0ceff1 plus PR #73, merged 18:53Z). P = plan.md line.

## Repo state

- main is 3 commits ahead of release/0.4: 4300fa5 (docs.yml stops copying the blog into the /next/ worktree), 3d956dd (deploy.json back to snapshot-only, PR #71), 7646ad4 (.claude/skills). Merge base 35a5620, the previous sync (#68, branch sync/0.4-35a5620c2a29).
- The fallow dupes gate, doctest rewriter port, agents.md and nx-sync tsconfig commits are all already on both branches (ancestors of 35a5620).
- `git merge-tree origin/release/0.4 origin/main` is clean today.
- None of the Group M files exists on main or release/0.4: tools/doc-examples/src/{regions,preamble,mdx-region-loader,declarations,behaviours,mdx-reference-loader,md-siblings}.mjs, apps/docs/tools/{md-siblings,pagefind,check-budgets,blog-feed}.mjs, apps/docs/tools/deploy/{build-site,docs-changed}.mjs, apps/docs/content/blog/, .github/ISSUE_TEMPLATE/04-rc-feedback.yml, the CI docs job. apps/docs/package.json has no scripts on either branch. Task 1's baseline expectations hold.
- main's docs.yml already calls `npm --prefix apps/docs run postbuild` and `node apps/docs/tools/check-budgets.mjs` (lines 94-99), which do not exist. That is the rc deploy failure Group M fixes.
- release/0.4 changes since rc.0 (8824502) that touch plan inputs: tools/doc-examples (doctestPreload, `docs/**/*.md` in docExampleSources, index.ts exports), .fallowrc.jsonc (readme-assets entries), tsconfig.json (readme-assets reference), nx.json (versionActions, stage-publish), commitlint (readme-assets scope), tools/release/sync.mjs (README pinning), libs/*/docs/*.md region files. None breaks a plan anchor except the items below.
- release/0.4 `.fallowrc.jsonc` duplicates threshold is 2.2%; main's is 2.6%. After the sync, release's value stays. The plan never runs `npx fallow dupes`. Group M adds ~10 copied modules and Groups E/R add many guards; run `npx fallow dupes` (CI runs it in the `main` job) on fix/docs-pipeline and again on feat/docs-phase-1.
- deploy.json: release/0.4 reads `rc`, main `snapshot-only`. The sync carries `snapshot-only` into release/0.4 (expected by spec §15.1; docs.yml reads main's copy only).
- Branches origin/fix/docs-next-blog-copy and origin/revert/deploy-mode-rc are gone on the remote (merged as PR #70 = 4300fa5 and PR #71 = 3d956dd). Local refs are stale; `git fetch --prune` clears them. No task impact.

## 1. Stale preconditions and edits that no longer apply

Group M against origin/main (Tasks 3, 4, 5, 8, 9, 10, 11 checked line by line; every Modify anchor, old string, test name and function exists on main as quoted):

- Task 4, P976: adding `"@nexusdi/core": "*"` to apps/docs dependencies makes fallow dead-code fail ("Unused dependencies: @nexusdi/core"). Drop it or add it to `ignoreDependencies` with a reason. Run `npx nx sync` before committing; new workspace deps in apps/docs can make nx sync want tsconfig references (check against the app tsconfig comment about `customConditions` and TS6305).
- Task 5, P1238: test "counts the console island and the background against their own rows" fails with the plan's code. `shared` (P1360) is built from scripts on every page, so the fixture's background.js is excluded and no background finding appears. Fix: build `shared` from page-kind scripts only.
- Task 5, P1122: `pagefind` devDependency fails fallow ("Unused devDependencies: pagefind"); pagefind.mjs runs it via `execFileSync('npx', ...)`. Add to `ignoreDependencies` with a reason.
- Task 6, P1966: says the scaffold's .fallowrc lists `mdx-components.js` as an entry. It does not. Expect to add PostList or mdx-components.js to `entry` if fallow reports it.
- Task 9, P2775/P2794: the clean fixture reads `"mode": "snapshot-only"`, so "passes rc mode with no blog" never exercises rc. The plan's fallback (clean copy with mode rc) fails validation on revision 0. Use `{ ...read('retention-due'), mode: 'rc', finalDate: null }` or add a `clean-rc` fixture.
- Task 10, P2902: `export const DOCS_YML_PATHS` fails fallow (unused export; the only consumer is a computed dynamic import). Add an `ignoreExports` entry like `readDeployConfig`.
- Task 10, P3076/P3085: the `docs:` YAML block is written at column 0; ci.yml jobs sit at 2 spaces. Indent when appending.
- Tasks 3, 8, 11: apply cleanly. Task 11's list of `gh release create` calls matches main (docs-snapshot.yml:147 with `--latest=false`, release.yml:243 with `--latest=$LATEST`).
- Task 7: docs.yml anchors match main exactly (root build "last five lines" = worktree add, rm -rf, cp -R, cd/build, mv).
- Task 12: see PR #74 below. Its post edits will not apply after #74 merges.

Tasks 14-81 against origin/release/0.4:

- Task 19, P5565: the plan shows `"publicPackages": ["@nexusdi/core", "@nexusdi/meridian-ui"]`. release lists nine packages. Append `@nexusdi/meridian-ui`; do not replace the list.
- Task 22, P6927: claims verify-packaging already runs `nx run-many -t build` covering internal/meridian-ui. On release it runs `-t stage-publish -p <libs>` and packs from tmp/publish/. The meridian block needs its own `npx nx run @nexusdi/meridian-ui:build` first.
- Task 23, P7323/P7504: global.css imports `tailwindcss` and postcss.config loads `@tailwindcss/postcss`, but no step installs them (neither is in root or apps/docs package.json). Add the install with the pinned `^4.3.3`.
- Task 24, P7600: the relative import of `../../libs/decorators/vite.decorators.ts` lacks the `// eslint-disable-next-line @nx/enforce-module-boundaries` the interceptors and devtools configs carry. Lint fails without it.
- Task 24, P7630: the fallow comment already names "decorators, devtools and interceptors"; add meridian and keep devtools.
- Tasks 23 and 74 (P7102, P28444): apps/docs/tsconfig.json has no `references`; adding one can trigger TS6305 under plain `tsc --project` (the file's own comment warns). Verify `nx typecheck @nexusdi/docs` after the reference lands.
- Task 17, P4816: the rewrite drops the `(entry: { mdxPath?: string[] })` annotation in page.tsx; check for implicit any.
- Task 74: precondition now holds. PR #73 merged; release/0.4 carries results/build.json, timings/2026-10-01-8824502.json, raw/...json.gz at core 0.4.0-rc.0. The stop at Review Focus item 5 can be skipped.
- Error codes: the plan's 40 codes match release exactly (core 28, interceptors 6, devtools 2, testing 2, decorators 1, federation 1). Every import in Tasks 15-81 resolves against release/0.4 exports.
- Region sources: release/0.4 gained libs/*/docs/*.md region files (163ef14, message "the docs site imports regions from libs/*/docs/*.md"). Task 32's REGION_ROOTS (P11011) is libs/core/README.md, examples/meridian/, libs/codemod/ (libs/codemod does not exist). No phase 1 page cites libs/*/docs, so nothing breaks, but the commit message and the plan disagree. Owner decision (see below). Task 35's reviewer text (P12028) has the same stale list.
- Task 34 adds a second `declaredCodes(libsDir)`; tools/repo-checks/src/error-codes.ts already exports an AST-based `declaredCodes(sources)`. Reuse it (P4, and fallow dupes).

## 2. Open PRs and branches

- PR #74 (main, docs/0-4-rc-0-announcement, mergeable, green). Rewrites apps/docs/snapshot/blog/2026-10-01-0-4-release-candidate.md, removes `draft: true` (publishes it), moves the draft fixture, drops the `/next/upgrade/` link from announcement.mjs and rewrites snapshot-overlay tests. Its post has no "## The codemod" section and no `@nexusdi/codemod` string, has a `DISCUSSION_URL` placeholder, and sends bugs to the 01-bug.yml template.
  - Task 12 Step 4 (P3456-3460): the old strings (description line, "## The codemod", the Feedback paragraph) are gone after #74. Task 12's new test still passes against #74's post.
  - Task 82 Step 3 (P30503): the `draft: true` -> `false` sed and the "holds the RC post as a draft until Phase 2" test rename no longer apply. On main today Task 82 is also broken independently: test line 118 "finds nothing while the only RC post is a draft" fails once the post is published.
  - Task 82 Step 5 expects `href="/next/upgrade/"` in the announcement bar; #74 removes that link ("links the upgrade guide again once /next/upgrade/ exists"). Nothing in the plan re-adds it.
  - Recommendation: the owner merges #74 (after filling DISCUSSION_URL) before the Group M PR. Then Task 12 keeps Steps 1-3 (form, labels), drops the codemod cut, and replaces #74's bug-template bullet with a link to the RC feedback form. Task 82 Step 3 becomes: re-add the `/next/upgrade/` link in announcement.mjs and its test (the guide exists after Task 60), with no draft flip. If #74 is not merged first, Task 12 as written conflicts with #74 and one of them must be redone.
- PR #73 (release/0.4): merged at 18:53Z. Task 74 can run.
- PR #66 (main, dependabot next 16.3.4 -> 16.3.6 in apps/docs, security fix for next/og ImageResponse): CI red (format, main, packaging; the lockfile is not updated). The static export does not use next/og. It conflicts with Group M's edits to apps/docs/package.json and package-lock.json and with the plan pin (P11, P37). Recommendation: owner closes #66 and bumps next and eslint-config-next to 16.3.6 together in one PR on main after Group M merges; then update the pin in globals.md. Do not mix it into fix/docs-pipeline.
- PR #59 (main, dev-dependencies: fallow 3.27.0 -> 3.30.0, yaml 2.9.0 -> 2.9.1, eslint-config-next 16.3.6, vite 8.3.1, others): green, but touches apps/docs/package.json, root package.json, package-lock.json. A fallow upgrade can change dupes and dead-code results the Group M fixes above rely on. Recommendation: hold #59 until Group M merges, then rebase it; or merge it first and re-run fallow on fix/docs-pipeline. Either way, not mid-Group-M.
- origin/fix/docs-next-blog-copy, origin/revert/deploy-mode-rc: already merged (#70, #71) and deleted on the remote. No action.
- Others open on main (#41-#51 dependabot): no plan overlap found except #46 (eslint-plugin-playwright 2.12.0), which would touch Task 15's lint setup if merged mid-plan.

## 3. Dependency map (Tasks 15-81)

Can start now on a branch from origin/release/0.4, rebase after the sync:

19, 20, 21, 22, 24, 26, 29, 33, 35, 74, 75, 76

Rebase notes: 74 edits apps/docs/package.json (Tasks 4, 5, 6 do too) and apps/docs/.gitignore; 75 edits mdx-components.js (Task 6 adds PostList there). Both conflict textually on rebase and resolve by keeping both sides. 75 also needs 22.

Needs the sync (Group M file in parentheses):

- 15 (build-site.mjs, Task 7)
- 16 (content/_meta.ts hidden `blog` entry and content/blog, Task 6; Task 16 rewrites _meta.ts and tests `meta.blog`)
- 17 (Task 15 e2e project, Task 16)
- 18 (mdx-region-loader, mdx-reference-loader, Tasks 2-3)
- 23 (Task 15 e2e, Task 16 layout)
- 25 (navigation.ts from Task 16)
- 27 (regions, mdx-region-loader, mdx-reference-loader, md-siblings, behaviours, declarations, Tasks 2-4)
- 28 (Task 25), 30 and 31 (Task 27 readExpandedSite), 32 (md-siblings, Task 4; Task 27), 34 (Task 28)
- 36-73 (Task 18 loaders, guards 25-34, `postbuild` from Tasks 4-6 in the build step)
- 77, 78 (postbuild, guards)
- 79 (Task 15 prepareSite, pagefind.mjs from Task 5)
- 80 (build-site.mjs Task 7, assemble code stubs Task 8, pages-server Task 15)
- 81 (all)

## 4. Conflicts with owner rules, spec and the plan itself

Blocks:

- Commit subjects, P21805, 22357, 22962, 23542, 24146, 24742, 25313: `feat(docs): add the code pages for NEXUS_BLUEPRINT_INVALID, ...`. commitlint `subject-case` is `['sentence-case', 'lower-case']` and `header-max-length` 100 (release/0.4 commitlint.config.js lines 80, 83). Upper-case codes and 110-142 char headers fail the hook; `--no-verify` is banned. Use e.g. `feat(docs): add the code pages for four blueprint errors` and list codes in the body.
- Task 82 (P30503-30510): see #74 above; snapshot-overlay test line 118 fails after the draft flip.

Fix in task:

- P12257: `git commit -m "docs: port the docs reviewer agent ..."` has no scope. Use `repo` (globals: `.claude` files are not listed; `repo` covers root config).
- Commit messages carry no `Co-Authored-By:` trailer; globals P26 requires it. The implementer appends it.
- Rule of three (ways-of-working bans it; globals P61 omits it, as it omits "naming the pattern" and abstract subjects). Triads in page or form prose: P3411 (issue form "What you ran, what you expected, and what you saw."), P12787, P16564, P17407, P18275, P19257, P21136, P26313, P26444. Make them two or four.
- Task 35 verbatim reviewer/skill text breaks the rules: P12032 "lands on a page" and three "is the shape" bullets, P12046/P12161/P12207 gerund subjects, P12175 "has cost a round trip", P12080 "Modals mean three different things", P12191 "If you stash, use `git stash push -u -m`" (ways-of-working: never stash, use a WIP commit).
- P19918 (/write-a-plugin/): "Adding an error, an event, a graph note or a package never requires ..." is a gerund subject.
- P2073/P2146 error message "Land the blog before setting final": metaphor verb. Use "Add".
- Task 12 cuts the codemod section but the post's "road to 0.4.0 final" paragraph keeps the codemod as a final criterion, against /release-candidate/ (P20342). Moot if #74 merges first (its post rewrites that section).
- P55: "every claim line stays at or under 80 characters", but 174 of 314 `// ->` lines exceed 80. Read it as "the code before `// ->`".
- Stops routed to the owner that ways-of-working sends to the architect and tech lead: P233 (mode not snapshot-only), P238 (red baseline), P30217 (E3 fails).
- No git/nx command in the plan carries `NX_NO_CLOUD=true NX_DAEMON=false`; prefix every one.

Cosmetic: P54 has 10 page kinds (spec §4.2 lists 9; code at rc.0 has `blog`, plan is right). P3196 vs spec §21 item 23 on release.yml's `gh release create` (code matches the plan). Spec §20 item numbers wrong at P3507, P30514, P2841. P22 says Groups A-Z go to feat/docs-phase-1 but Task 82 uses fix/docs-deploy-rc. P3381 says /release-candidate/ links the form; the page links /issues/new/choose (P20372).

Clean: no em or en dashes outside sabotaged fixtures, no "native", no reflect-metadata, no antithesis, no bold lead-ins, no filler openers, no short tables in page text. Interface-first holds after /getting-started/ (only the 0.3 "before" code on /upgrade/ binds classes, as a no-run block). No off-domain nouns. Counts: 82 tasks, 11 code-page tasks, 40 code pages.

## 5. Owner-only actions

- Merge into main: the Group M PR fix/docs-pipeline (Task 13, P3542); the Task 82 switch PR fix/docs-deploy-rc (P30512); the docs-snapshot.yml revision-2 PR (P30524). Also #74 (owner reads the post first) and the #66/#59 handling.
- Dispatch docs-snapshot.yml on main (P30524). Granted to the controller per progress.md; the resulting PR merges into main, which stays owner-only.
- GitHub settings: create labels `rc-feedback` and `rc-blocker` (P3496, P3534); create and pin the "0.4 RC feedback" Discussion and give its URL for #74's DISCUSSION_URL (P3496, P30510); add `docs` to required checks on the Main and Release branches rulesets (P3180, P3534).
- Release.yml `event=sync` (P24, P3549): forbidden to the controller; replaced by the hand sync below. Merging the sync PR and phase 1 into release/0.4 is granted to the controller in progress.md (the plan P24 still lists them as owner-only).
- npm: none.
- Decision for the owner: libs/*/docs/*.md region files. Either the site cites them (add `libs/*/docs/` to REGION_ROOTS in Task 32 and the reviewer text) or they stay package-only and 163ef14's wording is wrong. Recommendation: keep pages on examples/meridian as the plan does, drop `libs/codemod/` until the package exists, and record the decision.

## 6. The sync by hand (no release.yml)

What release.yml does (release/0.4 .github/workflows/release.yml lines 109-150, tools/release/sync.mjs): plan.mjs names the branch `sync/<line>-<main sha first 12>` (lib.mjs:167), then `sync.mjs merge <branch>` switches to that branch from release/0.4, merges origin/main with `--no-ff --no-commit`, settles libs/*/package.json (line version and @nexusdi pins), pins README repo URLs to the line version, regenerates package-lock.json, and commits with `git commit --no-edit`. On any other conflict it aborts and the owner finishes with `sync.mjs restore`. It pushes, then opens the PR with title `chore(repo): sync main into release/0.4`.

By hand, after the Group M PR is merged into main. Use a dedicated worktree so hooks run from a checkout with installed husky hooks. Check `uptime` first; the pre-commit hook runs `nx affected -t lint`.

```sh
export NX_NO_CLOUD=true NX_DAEMON=false
git fetch origin --prune
git merge-base --is-ancestor origin/main origin/release/0.4 && echo "nothing to sync"
SHA12=$(git rev-parse origin/main | cut -c1-12)
BR=sync/0.4-$SHA12
git ls-remote --exit-code --heads origin "$BR" && echo "branch exists: stop"
git worktree add -b "$BR" .claude/worktrees/sync-0.4 origin/release/0.4
cd .claude/worktrees/sync-0.4
npm ci                                   # installs the husky hooks
# Option A, the job's own script (handles a clean merge end to end):
#   sync.mjs merge creates the branch itself, so run it from a detached
#   release/0.4 checkout instead of the -b above:
#   git switch --detach origin/release/0.4 && node tools/release/sync.mjs merge "$BR"
# Option B, the RELEASING.md hand path (use when A reports conflicts):
git merge --no-ff --no-commit origin/main
#   resolve listed paths; expected: tools/doc-examples/src/index.ts (keep both
#   export lists), maybe .fallowrc.jsonc, apps/docs/package.json, package-lock.json
node tools/release/sync.mjs restore      # settles manifests, READMEs, lockfile
git commit --no-edit                     # "Merge remote-tracking branch 'origin/main' into sync/0.4-<sha12>"
git push -u origin "$BR"
gh pr create --base release/0.4 --head "$BR" \
  --title "chore(repo): sync main into release/0.4" \
  --body "Merges main at $(git rev-parse origin/main) into release/0.4. Merge with a merge commit (RELEASING.md, \"Branches\")."
gh pr checks --watch
gh pr merge --merge                      # merge commit, never rebase or squash
```

Notes:

- The hooks allow the merge commit only because HEAD is `sync/*` (.husky/pre-merge-commit, .husky/pre-commit). Never `--no-verify`. The merge message is git's default; commitlint ignores merge commits (precedent 6bb0009 in #68).
- release/0.4 already has `.gitattributes` with `libs/*/CHANGELOG.md merge=union` (from #68), so the info/attributes line in RELEASING.md is not needed. sync.mjs `merge` appends it anyway.
- sync.mjs `restore` exits 1 if anything is still unmerged or a manifest has a real conflict. Run it after resolving the other paths and before committing.
- Required checks on release/0.4: main, workflows, format, packaging, CodeQL (release skill). ci.yml and codeql.yml also run on push to `sync/**`. A PR opened with a user token gets normal pull_request runs; if a required check sits at "expected", close and reopen the PR.
- Use the release/0.4 copy of sync.mjs (the merged tree keeps release's version, since main has not touched it since 35a5620). It also pins README repo URLs to 0.4.0-rc.0; expect those README diffs in the commit only if main's READMEs moved.
- Do not delete the sync branch by hand; `delete_branch_on_merge` removes it.
- After merge: `git fetch origin && git merge-base --is-ancestor origin/main origin/release/0.4 && echo synced`, then Task 14 Step 1.
