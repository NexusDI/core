import {
  lazySection,
  SectionBoundary,
  type SectionConflictError,
  type SectionError,
} from '@nexusdi/react';
import { lazy, Suspense } from 'react';

import { Button } from '../components';

// Declared once, at module level, so its identity holds across renders.
const Cartography = lazySection('cartography', () =>
  import('../sections/cartography').then((m) => m.Cartography),
);
// The same chunk as the section, so it is in place once the section loads.
const StarMap = lazy(() =>
  import('../sections/cartography').then((m) => ({ default: m.StarMap })),
);

const unrolling = <p>Unrolling the star map</p>;

function ChartsOffline({
  retry,
}: {
  error: SectionError | SectionConflictError;
  retry(): void;
}) {
  return (
    <p>
      The star map did not load.{' '}
      <Button type="button" onClick={retry}>
        Retry
      </Button>
    </p>
  );
}

/** The server HTML carries the fallback; the browser loads the section after hydration. */
export default function Charts() {
  return (
    <SectionBoundary
      section={Cartography}
      fallback={unrolling}
      errorFallback={ChartsOffline}
    >
      <Suspense fallback={unrolling}>
        <StarMap />
      </Suspense>
    </SectionBoundary>
  );
}
