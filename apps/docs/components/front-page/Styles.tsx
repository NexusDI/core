import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from './facts';

let css: string | undefined;

/**
 * The front page's stylesheet, written into the page's own HTML. Nextra serves
 * every MDX page from one catch-all route, and a stylesheet that a component
 * imports reaches the route's entry, so every guide would load it (site UX
 * spec 12.1, and the guide ratchet in `check-budgets.mjs`). Read from the file
 * at build time, it costs only this page.
 */
export default function Styles() {
  css ??= readFileSync(
    join(
      workspaceRoot(),
      'apps',
      'docs',
      'components',
      'front-page',
      'front-page.css',
    ),
    'utf8',
  );
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
