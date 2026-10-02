# Task 67 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 24149-24744 (read them all).
Shared constraints: tasks/globals.md in this folder.

No amendments beyond globals.md and preflight.md.

Controller amendment (code pages): for each code this task writes, remove its entry from tools/repo-checks/src/doc-error-codes-allowance.json and its `/errors/<CODE>/` entry from doc-links-allowance.json. Each code page states only behaviour you reproduced against libs/*/src (run every fence; claims as `// -> value`).
Controller amendment (wording): the plan's triad "the code, the fields as `key=value` pairs and the address of this page" becomes "a one-line message that starts with the code and ends with the address of this page" (as in NEXUS_MISSING_PROVIDER.mdx). Use only bare codes and throwers that libs/*/src confirms: some are thrown bare, others sit inside NEXUS_BLUEPRINT_INVALID.
