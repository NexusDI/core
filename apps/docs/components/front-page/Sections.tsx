import type { ReactNode } from 'react';
import Link from 'next/link';
import { Terminal, type TerminalLine } from '@nexusdi/meridian-ui';

import Cutaway from './Cutaway';
import seed from './fixtures/seed.json';

/** A section on the bulkhead. It follows the reader's theme (site UX spec 4.1). */
export function Band({
  id,
  wide = false,
  children,
}: {
  id?: string;
  /** Lets a child use the full width; the heading and prose keep the measure. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={
        wide ? 'nexus-front__band nexus-front__band--wide' : 'nexus-front__band'
      }
      id={id}
    >
      <div className="nexus-front__text">{children}</div>
    </section>
  );
}

/**
 * The program under the bay, collapsed (site UX spec 4.1). A plain `details`:
 * the component map of the docs gives `details` a Nextra component that wraps
 * the summary in a heading, and this one is no heading of the page.
 */
export function Program({ children }: { children: ReactNode }) {
  return (
    <details className="nexus-program">
      <summary>See the program</summary>
      <div className="nexus-program__body">{children}</div>
    </details>
  );
}

/** The one line of "When to skip NexusDI" (site UX spec 4.9 and Q10). */
export function WhenToSkip({ children }: { children: ReactNode }) {
  return <div className="nexus-front__when-skip">{children}</div>;
}

/** The closing section's one primary button. */
export function GetStarted() {
  return (
    <Link
      className="meridian-button meridian-button--primary"
      href="/getting-started/"
    >
      Get started
    </Link>
  );
}

const STATES = { ok: 'nominal', pass: 'nominal' } as const;

/** The seed's check as a terminal reads it: the fixture's own text, line by line. */
function checkLines(): TerminalLine[] {
  const text = seed.terminal.check.split('\n');
  const sources = ['shell', 'node', 'shell'];
  const statuses = [undefined, undefined, 'ok'];
  return text.map((message, at) => ({
    tick: String(at + 1).padStart(4, '0'),
    source: sources[at] ?? 'shell',
    message,
    status: statuses[at],
  }));
}

/**
 * The pre-flight bay (site UX spec 4.3), as a reader without JavaScript sees
 * it: the heading and lead from the page, and the seed's terminal with
 * `pre-flight ok` and exit 0, which `scene-fixtures.mjs` writes by running
 * `Nexus.check` on the seed, under the painted cutaway with the seed lit. The
 * bay's controller adds the hotspots and the drills in a later change. The
 * screen stays dark in both themes (design system V1).
 */
export function Preflight({ children }: { children: ReactNode }) {
  return (
    <section
      className="meridian-screen nexus-front__screen nexus-bay"
      id="pre-flight"
      aria-labelledby="pre-flight-check"
    >
      <div className="nexus-bay__inner">
        <div className="nexus-bay__head">{children}</div>
        <div className="nexus-bay__ship">
          <Cutaway sizes="(min-width: 1440px) 1344px, calc(100vw - 2rem)" />
        </div>
        <div className="nexus-bay__terminal">
          <Terminal title="preflight.ts" lines={checkLines()} states={STATES} />
        </div>
      </div>
    </section>
  );
}
