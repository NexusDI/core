'use client';

import { type ComponentType, useEffect, useState } from 'react';

/**
 * The type card of a page's typed tokens, loaded when the page mounts.
 *
 * `tools/mdx-nextra-loader.mjs` writes `<TypeCards />` at the end of every
 * page with a `twoslash` fence, so the card lives in the page's own tree: a
 * client navigation unmounts it with the page it came from and mounts a new
 * one with the next. Nextra serves every page from one route, and a
 * component in `mdx-components.js` ships with every page, so the popover
 * itself comes in with `import()` and a guide without a typed token never
 * loads it.
 */
export default function TypeCards() {
  const [Popover, setPopover] = useState<ComponentType | null>(null);

  useEffect(() => {
    let live = true;
    // A chunk a deploy has replaced fails to load, and the tokens stay plain
    // buttons with no card, as they are with JavaScript off.
    import('./PagePopover').then(
      (loaded) => {
        if (live) setPopover(() => loaded.PagePopover);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  return Popover ? <Popover /> : null;
}
