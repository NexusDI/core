---
name: gemma-docs
description: Use when writing or rewriting a NexusDI docs page, README, blog post or other user-facing text. Gemma writes the prose; Claude checks the facts against the code.
---

# Gemma writes the prose, Claude checks the facts

The owner prefers Gemma's voice for user-facing text. Gemma restructures and
rewrites. Claude keeps the text true to the code and to what users can expect
from the library. Claude does not restyle Gemma's sentences.

## Run Gemma

```bash
node tools/gemma-refactor.mjs <file> --out <scratch-file> [--note "<extra instruction>"]
```

- The script sends the file and `docs/documentation-style-guide.md` to
  `gemma4:31b` on Ollama Cloud (`GEMMA_MODEL` overrides the model).
- The key comes from `$OLLAMA_API_KEY`, else the keychain item `ollama-cloud`
  (`$OLLAMA_KEYCHAIN_SERVICE` overrides the name).
- Gemma may change frontmatter text fields (title, description), headings and
  link text. The script prints a note for each changed frontmatter key and a
  warning for each code fence that changed or disappeared.
- A page takes a few seconds. Write output to the scratchpad, never straight
  over the source.
- For a new page, write a plain draft with every fact and code region first,
  then send the draft.

## Check Gemma's output

1. Diff the draft against the output. Every fact, API name, error code,
   version and behaviour statement in the draft must still be there. Restore
   any that Gemma dropped as a new sentence in Gemma's voice.
2. Check every claim against `libs/`. A wrong sentence gets the smallest edit
   that makes it true. List each such edit in the report.
3. Restore any code fence the script warned about, word for word.
4. A changed heading changes its anchor. Grep `apps/docs/content` for links to
   the old anchor and update them.
5. Run the repo-checks and the docs build. Fix a refused word or rule with the
   smallest edit.

## Rules

- Never rewrite or delete a Gemma sentence for style. Add facts as new
  sentences next to hers. Only a factual error justifies changing one.
- Before reporting, list Gemma's sentences that no longer appear word for word
  (a sentence-level diff against her output). That list holds only the factual
  fixes and check fixes, each with a reason.
- Subagents doing this work get these rules in their brief, on the cheapest
  model that fits. The owner watches the weekly budget.
