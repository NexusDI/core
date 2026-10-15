import {
  lazySection,
  NexusProvider,
  ScopeProvider,
  SectionBoundary,
  useContainer,
  useService,
} from '@nexusdi/react';

import { FLIGHT_LOG, NAV_CHARTS } from '../bridge/contracts';

const navigation = lazySection('navigation', () =>
  import('../sections/navigation').then((m) => m.Navigation),
);

function Log({ id }: { id: string }) {
  return <p id={id}>{useService(FLIGHT_LOG).entries()[0]}</p>;
}

function Heading() {
  return <p id="heading">heading {useService(NAV_CHARTS).heading('Vega')}</p>;
}

export default function Course() {
  return (
    <>
      <Log id="course" />
      <ScopeProvider fallback={<p>Docking</p>}>
        <Log id="docked" />
      </ScopeProvider>
      <SectionBoundary section={navigation} fallback={<p>Loading section</p>}>
        <Heading />
      </SectionBoundary>
      <NexusProvider
        container={useContainer()}
        clientOnly
        fallback={<p>Console skeleton</p>}
      >
        <Log id="console" />
      </NexusProvider>
    </>
  );
}
