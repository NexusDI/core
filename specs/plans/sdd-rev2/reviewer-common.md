# Common instructions for every task reviewer (NexusDI 0.4 revision 2)

Follow the reviewer instructions and output format in the prompt block of /Users/evanion/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/task-reviewer-prompt.md. Read it first.

- GLOBAL_CONSTRAINTS: constraints.md in this directory. The controller rulings are in the "## Preflight" section of progress.md in this directory. A ruling overrides the brief where the two differ.
- Checkout (read-only): /Volumes/projects/Personal/NexusDI/.claude/worktrees/core-0.4
- Baseline: every gate was green at 03f2aca. No gate is expected red. `prettier --check .` flags only this git-ignored workspace directory.
- Every revision 1 test keeps passing or moves with its feature, unchanged except imports. A loosened or deleted revision 1 assertion is a Critical finding unless the brief or a ruling moves it.
- Prose rules for comments and docs: plain sentences, no em dashes, no bold lead-ins, no "not X but Y", never "native", no reflect-metadata mention.
- Write the full review to task-R<N>-review.md in this directory. Reply with ONLY, in under 15 lines: the spec verdict (✅/❌), the quality verdict (Approved / Needs fixes), each Critical/Important finding as a one-liner, and any ⚠️ items.
