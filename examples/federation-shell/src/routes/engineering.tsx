import { SectionBoundary } from '@nexusdi/react';
import { lazy, Suspense } from 'react';

import { SectionFailed } from '../section-failed';
import { engineering, EngineeringStation } from '../sections';

const EngineeringPanel = lazy(() =>
  engineering().then((m) => ({ default: m.EngineeringPanel })),
);

/** `/engineering`: the reactor, coolant and power gauges. */
export function EngineeringRoute() {
  return (
    <SectionBoundary
      section={EngineeringStation}
      fallback={<p>Loading engineering...</p>}
      errorFallback={SectionFailed}
    >
      <Suspense fallback={<p>Loading the engineering panel...</p>}>
        <EngineeringPanel />
      </Suspense>
    </SectionBoundary>
  );
}
