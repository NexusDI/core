# Shared brief for page tasks (Groups P, Q, R pages)

- The plan gives each page's MDX and its examples file text. Write them as given, then make every guard pass. When a guard or doctest fails on the plan's text, fix the text to meet the guard and the writing rules; keep the plan's meaning and say what changed.
- Every region is a whole program in `examples/meridian/src/pages/<slug>.md` (or `src/errors/<CODE>.md`) between `<!-- #region name -->` markers, run as a doctest and type-checked. Claimed values sit on a one-line `const` with `// -> value`, printed on the next line. Import and claim lines stay at or under 80 characters.
- Check every claim against `libs/*/src` on this branch (the 0.4 API): exports, option names, error codes and messages. The code wins over the plan text.
- Remove the page's own entries from every guard allowance (doc-floor, doc-commitments, doc-links, doc-error-codes, and any other `*-allowance.json` naming the page or code). Add the `_meta.ts` entry if the plan says so.
- Examples after /getting-started/ are interface-first: `Token<IFoo>` with `provide(TOKEN, { useClass: Impl })`. Domain: the Starship Meridian.
- Verify: `npx nx run-many -t lint,typecheck,test -p @nexusdi/meridian @nexusdi/repo-checks @nexusdi/docs --skip-nx-cache` (read the summary line), `DOCS_BASE_PATH=/next DOCS_CHANNEL=next npx nx build @nexusdi/docs` (check `uptime`), `npx nx sync:check`, `npx fallow dupes`, `npx fallow dead-code --fail-on-issues --no-cache`, prettier on changed files.
- Read the built page at apps/docs/out/<slug>/index.html once: the regions expanded, the listings labelled, no raw `<!-- #region` or `file=` left.
- Decision 33: the reader runs, breaks and fixes what the page teaches. The plan's text sometimes stops after the break; when it does, add the fix step (what to change back, what then prints) and say what the reader sees when the broken program runs.
- The plan's prose has rule-of-three lists; rewrite each as two items or four.
- Carry out every break and fix step the page asks for in a scratch copy of its region (under /tmp/claude-0/), and write down what really happens: the line tsc flags, the error code, the output.
