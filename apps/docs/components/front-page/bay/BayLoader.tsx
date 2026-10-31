'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Initial } from './PreflightBay';

type Bay = typeof import('./PreflightBay').default;

/**
 * Holds the server's bay (the lit seed, `pre-flight ok` and no control) until
 * the bay controller arrives, then swaps in the controller on the same
 * layout. `index.mdx` reaches the controller through this one `import()`, so
 * no other page carries it (site UX spec 5.6 and 12.1). The cutaway's SVG
 * markup is read from the server's own render, so the page sends it once.
 */
export default function BayLoader({
  initial,
  children,
}: {
  initial: Initial;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<{ Bay: Bay; markup: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const markup =
      host.current?.querySelector('.meridian-schematic__art')?.innerHTML ?? '';
    void import('./PreflightBay').then((loaded) => {
      if (!cancelled && markup !== '') setLive({ Bay: loaded.default, markup });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={host} className="nexus-bay__host">
      {live ? <live.Bay markup={live.markup} initial={initial} /> : children}
    </div>
  );
}
