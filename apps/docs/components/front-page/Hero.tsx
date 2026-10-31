import type { ReactNode } from 'react';
import Link from 'next/link';

import HeroArt from './HeroArt';
import InstallLine from './InstallLine';

/**
 * The hero (site UX spec 4.2): the painted Meridian in space, and the copy
 * over it at the left on a wide screen and above it on a phone. The page's H1
 * and its two-sentence definition arrive as children, so they stay the
 * Markdown of `content/index.mdx` and the overview guards read them there.
 * One primary button, the install line, and a quiet link to the pre-flight
 * check. The screen stays dark in both themes (design system V1).
 */
export default function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="meridian-screen nexus-front__screen nexus-hero">
      <HeroArt />
      <div className="nexus-hero__copy">
        {children}
        <InstallLine releaseLine />
        <p className="nexus-hero__actions">
          <Link
            className="meridian-button meridian-button--primary"
            href="/getting-started/"
          >
            Get started
          </Link>
          <a className="nexus-quiet" href="#pre-flight">
            See the pre-flight check
          </a>
        </p>
      </div>
    </section>
  );
}
