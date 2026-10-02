# Shared review brief for page tasks

Read-only. Check, in this order:
1. Content: every claim matches libs/*/src on the branch (exports, option names, defaults, error codes and message text). Run the page's doctest and type-check (`npx nx test @nexusdi/meridian --skip-nx-cache`).
2. Teaching: the reader runs, breaks and fixes what the page teaches (spec decision 33); the page has its kind's sections (spec §4.2) and the heading text doc-commitments expects.
3. Writing rules on every prose line: no em/en dashes, bold lead-ins, antithesis ("not X but Y", "rather than", "instead of"), gerund or abstract subjects, metaphor verbs (bites, lands, buys, costs, earns, pays, survives, ships), filler openers, rule of three, naming the pattern, tables under four rows, "native", reflect-metadata. Interface-first after /getting-started/. Starship Meridian domain.
4. Guards: the page's own allowance entries are gone; repo-checks passes (`npx nx test @nexusdi/repo-checks --skip-nx-cache`).
5. The built page (apps/docs/out/<slug>/index.html, already built by the implementer; rebuild only if missing): regions expanded, listings labelled, no raw region markers.
Report: APPROVED or CHANGES_REQUIRED, findings as `[critical|important|minor] file:line: problem. Fix: ...`, at most 20 lines.
