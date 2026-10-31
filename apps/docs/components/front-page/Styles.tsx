import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from './facts';

/** The files this page's stylesheet is made of, relative to the workspace root. */
const SHEETS = [
  ['internal', 'meridian-ui', 'src', 'schematic.css'],
  ['apps', 'docs', 'components', 'front-page', 'front-page.css'],
];

/**
 * The front page's stylesheet: the schematic rules of
 * `@nexusdi/meridian-ui/schematic.css` and the page's own rules, written into
 * the page's HTML. Nextra serves every MDX page from one catch-all route, and
 * a stylesheet that a component imports reaches that route's entry, so every
 * guide would load it (site UX spec 12.1 and the guide ratchet in
 * `check-budgets.mjs`). React 19 hoists a `<style>` that carries `href` and
 * `precedence` into the head, once per page.
 */
export default function Styles() {
  const root = workspaceRoot();
  const css = SHEETS.map((parts) =>
    readFileSync(join(root, ...parts), 'utf8'),
  ).join('\n');
  return (
    <style href="nexus-front-page" precedence="default">
      {css}
    </style>
  );
}
