import { useService } from '@nexusdi/react';

import { NAV_ROUTES } from './cartography.module';

/** The plotted course to Kepler-442b, read from the shell's container. */
export function StarMap() {
  const routes = useService(NAV_ROUTES);
  return (
    <section aria-label="star map">
      <h2>Star map</h2>
      <p>{routes.find('Kepler-442b')}</p>
    </section>
  );
}
