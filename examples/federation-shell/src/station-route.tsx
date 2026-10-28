import { SectionBoundary } from '@nexusdi/react';
import { Suspense } from 'react';

import { SectionFailed } from './section-failed';
import { SECTIONS } from './sections';
import type { Station } from './stations';

/** The route of a station: its section, then its panel once the section loads. */
export function StationRoute({ station }: { station: Station }) {
  const loaded = SECTIONS.get(station.id);
  if (loaded === undefined) throw new Error(`No section for ${station.id}.`);
  const { section, Panel } = loaded;
  return (
    <SectionBoundary
      section={section}
      fallback={<p>Loading {station.label.toLowerCase()}...</p>}
      errorFallback={SectionFailed}
    >
      <Suspense fallback={<p>Loading the {station.panelName}...</p>}>
        <Panel />
      </Suspense>
    </SectionBoundary>
  );
}
