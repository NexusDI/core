import { useService } from '@nexusdi/react';
import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';

import { NAV_ROUTES } from '../di/navigation.module';

// The charts route loads the section module through this file, so the module
// and StarMap build into one chunk.
export { Cartography } from '../di/cartography.module';

/** The heading to each charted star, read through the loaded section. */
export function StarMap() {
  const routes = useService(NAV_ROUTES);
  const charts = useService(NAV_CHARTS);
  return (
    <ul>
      {charts.stars().map((star) => {
        const route = routes.find(star);
        return <li key={star}>{`${route.to}: heading ${route.heading}`}</li>;
      })}
    </ul>
  );
}
