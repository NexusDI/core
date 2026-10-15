import { lazySection, SectionBoundary, useService } from '@nexusdi/react';

import { FLIGHT_LOG, NAV_CHARTS } from './contracts';

const navigation = lazySection('navigation', () =>
  import('./sections/navigation').then((m) => m.Navigation),
);

function Heading() {
  return <p id="heading">heading {useService(NAV_CHARTS).heading()}</p>;
}

export function App() {
  return (
    <>
      <p id="log">{useService(FLIGHT_LOG).label()}</p>
      <SectionBoundary section={navigation} fallback={<p>Loading section</p>}>
        <Heading />
      </SectionBoundary>
    </>
  );
}
