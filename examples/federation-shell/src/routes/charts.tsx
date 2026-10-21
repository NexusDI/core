import { SectionBoundary } from '@nexusdi/react';
import { lazy, Suspense } from 'react';

import { SectionFailed } from '../section-failed';
import { Cartography, cartography } from '../sections';

const StarMap = lazy(() => cartography().then((m) => ({ default: m.StarMap })));

/** `/charts`: the cartography station. */
export function Charts() {
  return (
    <SectionBoundary
      section={Cartography}
      fallback={<p>Loading cartography...</p>}
      errorFallback={SectionFailed}
    >
      <Suspense fallback={<p>Loading the star map...</p>}>
        <StarMap />
      </Suspense>
    </SectionBoundary>
  );
}
