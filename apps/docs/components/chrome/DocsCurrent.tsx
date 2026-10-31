'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Marks the navbar's Docs entry current on every content page (site UX spec
 * 13.1). Nextra marks an entry current only on the page its `href` names, and
 * the Docs entry points at the first page of the teaching order, so on every
 * other page it would read as no place. Every route but the front page is a
 * docs page. The entry is Nextra's link, so the mark goes on its element.
 */
export default function DocsCurrent() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/') return;
    const entry = document.querySelector<HTMLElement>(
      '.nextra-navbar nav a[href$="/getting-started/"]',
    );
    if (!entry || entry.hasAttribute('aria-current')) return;
    entry.setAttribute('aria-current', 'page');
    return () => entry.removeAttribute('aria-current');
  }, [pathname]);

  return null;
}
