import { useService } from '@nexusdi/react';

import { NAV_ROUTES } from './cartography-station.module';

/** The plotted course to Kepler-442b, read from the shell's container. */
export function CartographyPanel() {
  const routes = useService(NAV_ROUTES);
  return (
    <section aria-label="star map">
      <h2>Star map</h2>
      <p>{routes.find('Kepler-442b')}</p>
    </section>
  );
}
