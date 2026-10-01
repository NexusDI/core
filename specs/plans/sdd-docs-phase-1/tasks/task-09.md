# Task 9 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 2745-2825 (read them all).
Shared constraints: tasks/globals.md in this folder.

## Amendments (these override the plan text)

Preflight P2775/P2794: the clean fixture reads snapshot-only, so "passes rc mode with no blog" never exercises rc. Use { ...read('retention-due'), mode: 'rc', finalDate: null } or add a clean-rc fixture.
