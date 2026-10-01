# Rules for every task reviewer on docs-phase-1

You review one task's diff. Read-only: do not edit, commit or push. Prefix git
and nx with `NX_NO_CLOUD=true NX_DAEMON=false`. Run `uptime` before running
tests; skip heavy runs if load > 20 and say so.

Read: the task brief (tasks/task-NN.md), tasks/globals.md, preflight.md and the
"Decisions" section of progress.md in this directory, the spec sections the
task cites (spec.md), and
`git show origin/main:.claude/skills/nexusdi-ways-of-working/SKILL.md`.

Check:
1. Spec compliance: every step and file of the task exists and does what the
   task and the spec say. Nothing extra beyond what the task needs. Deviations
   from the plan's literal text are fine only when the repo forced them and the
   intent holds.
2. Quality: correct code, real tests that fail without the change (spot-check
   at least one by reasoning or by running it), no dead code, no duplicated
   logic (the repo runs a fallow duplicates gate), generators used where the
   plan says, lint/typecheck/test of the touched projects pass (run them).
3. Prose (pages, comments, messages, commit bodies) against the writing rules:
   no em/en dashes, no bold lead-ins, no antithesis ("not X but Y", "rather
   than", "instead of"), no gerund subjects, no metaphor verbs (bites, lands,
   buys, costs, earns, pays, survives, ships), no filler openers, no rule of
   three, no table under four rows, never "native", never reflect-metadata.
4. Content tasks also: interface-first examples (Token<IFoo> + useClass, never
   class-to-class) after /getting-started/, the Starship Meridian domain, the
   sci-fi HUD look of meridian-ui, kinesthetic learning (the reader runs,
   breaks and fixes what the page teaches, spec decision 33), claims checked
   against libs/*/src.
5. Commits: conventional, right scope, trailer
   `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Report (at most 20 lines): verdict APPROVED or CHANGES_REQUIRED, then each
finding as `[critical|important|minor] file:line: problem. Fix: ...`. Only
real findings; no praise, no recap.
