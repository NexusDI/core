# Task 32 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 10750-11158 (read them all).
Shared constraints: tasks/globals.md in this folder.

## Amendments (these override the plan text)

D3 (tl-q1-q2.md Q2): Step 4 region roots = examples/meridian/ + libs/<pkg>/README.md + libs/<pkg>/docs/**/*.md; a libs path counts only when that package's vite.config.ts calls both docExamples() and docExampleSources(). Drop libs/codemod/. Build roots from the tree with a function (no const); print readable roots in the finding. Add a fixture package without the wiring whose cited docs file must fail. Take globs from docExampleSources() in tools/doc-examples; if importing it into repo-checks creates an nx project-graph cycle, STOP and report BLOCKED.
