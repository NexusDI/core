# Task 45 brief

Task text: /home/user/core/specs/plans/2026-09-23-docs-phase-1.md lines 15328-15586 (read them all).
Shared constraints: tasks/globals.md in this folder.

No amendments beyond globals.md and preflight.md.

Controller amendment (Task 18 review): this is the first page with a `mermaid` fence. Build the /next/ site and open the page in a browser (Playwright chromium) in both themes; check the rendered SVG carries no literal colour outside the Meridian custom properties (Mermaid's base theme derives some colours from primaryColor). Report what you find; fix palette.ts recolour if a colour leaks.
