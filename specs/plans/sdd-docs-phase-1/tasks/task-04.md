# Task 4 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 798-1002 (read them all).
Shared constraints: tasks/globals.md in this folder.

## Amendments (these override the plan text)

Preflight P976: adding "@nexusdi/core": "*" to apps/docs dependencies fails fallow dead-code (unused dependency). Drop it or add it to ignoreDependencies with a reason. Run `npx nx sync` before committing (check the apps/docs tsconfig comment about customConditions and TS6305).
