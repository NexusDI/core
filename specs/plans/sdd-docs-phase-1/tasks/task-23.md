# Task 23 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 7083-7523 (read them all).
Shared constraints: tasks/globals.md in this folder.

## Amendments (these override the plan text)

Preflight P7323/P7504: install tailwindcss and @tailwindcss/postcss ^4.3.3 (neither is in a package.json). P7102: verify `nx typecheck @nexusdi/docs` after any tsconfig reference lands (TS6305). D5 ground role names.

Controller amendment (Task 17 review): Task 17 renders `<p class="nexus-release">` before each page's h1 on the /next/ channel and no task styles it. Add a `.nexus-release` rule to the global.css block in this task, built from Meridian tokens (D5 ground names), in the HUD look of spec §8.
