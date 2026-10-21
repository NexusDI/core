import { SectionBoundary } from '@nexusdi/react';
import { lazy, Suspense } from 'react';

import { SectionFailed } from '../section-failed';
import { Command, command } from '../sections';

const CommandDeck = lazy(() =>
  command().then((m) => ({ default: m.CommandDeck })),
);

/** `/command`: the command station, whose classes use decorators. */
export function CommandRoute() {
  return (
    <SectionBoundary
      section={Command}
      fallback={<p>Loading command...</p>}
      errorFallback={SectionFailed}
    >
      <Suspense fallback={<p>Loading the command deck...</p>}>
        <CommandDeck />
      </Suspense>
    </SectionBoundary>
  );
}
