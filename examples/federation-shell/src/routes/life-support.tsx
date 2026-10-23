import { SectionBoundary } from '@nexusdi/react';
import { lazy, Suspense } from 'react';

import { SectionFailed } from '../section-failed';
import { lifeSupport, LifeSupportStation } from '../sections';

const LifeSupportPanel = lazy(() =>
  lifeSupport().then((m) => ({ default: m.LifeSupportPanel })),
);

/** `/life-support`: the compartment air and the atmosphere commands. */
export function LifeSupportRoute() {
  return (
    <SectionBoundary
      section={LifeSupportStation}
      fallback={<p>Loading life support...</p>}
      errorFallback={SectionFailed}
    >
      <Suspense fallback={<p>Loading the life-support panel...</p>}>
        <LifeSupportPanel />
      </Suspense>
    </SectionBoundary>
  );
}
