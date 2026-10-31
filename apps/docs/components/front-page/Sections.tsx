import type { ReactNode } from 'react';
import Link from 'next/link';

import BayLoader from './bay/BayLoader';
import { BayView } from './bay/BayView';
import { shipView } from './bay/ship-view';
import { seedInitial } from './bay/seed-bay';
import { SEED_STATE } from './bay/state';
import { schematicMarkup } from './seed-ship';

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

/**
 * The pre-flight bay (site UX spec 4.3) as a reader without JavaScript sees
 * it: the heading and lead from the page, and under them the bay's static
 * render, which holds the seed lit from the fixture's trace, `pre-flight ok`
 * and no control. `BayLoader` swaps in the controller on the same layout. The
 * screen stays dark in both themes (design system V1).
 */
export function Preflight({ children }: { children: ReactNode }) {
  const initial = seedInitial();
  const view = shipView({
    state: SEED_STATE,
    power: initial.power,
    check: { ok: true, error: null },
    startupError: null,
    lookupError: null,
    online: [],
    linked: null,
  });
  return (
    <section
      className="meridian-screen nexus-front__screen nexus-bay"
      id="pre-flight"
      aria-labelledby="pre-flight-check"
    >
      <div className="nexus-bay__inner">
        <div className="nexus-bay__head">{children}</div>
        <BayLoader initial={initial}>
          <BayView
            markup={schematicMarkup()}
            layout="both"
            view={view}
            state={SEED_STATE}
            section="tactical"
            log={initial.log.map((line, at) => ({
              ...line,
              tick: at + 1,
              block: 0,
            }))}
            tab="run"
            source=""
            status="nominal"
            exit={0}
            errorsOn
            launchLabel="Launch"
            locked={null}
            launching={false}
            checkWord="Check passed"
            caption={null}
            levels={initial.levels}
            currentLevel={undefined}
            hint={null}
            hover={null}
            outline={null}
            graph={null}
            showGraph={false}
            acknowledged={false}
            announce=""
            errorPages={initial.errorPages}
            width={{ wide: 1344, phone: 358 }}
            coarse={false}
            actions={null}
          />
        </BayLoader>
      </div>
    </section>
  );
}
