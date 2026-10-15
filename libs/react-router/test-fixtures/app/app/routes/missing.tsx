import { lazy } from '../nexus.server';
import { NAV_ROUTES } from '../ship';

// NAV_ROUTES is in no module the root container imports. The function form
// validates on the first request, so this answers 500.
export const loader = lazy.inject({ routes: NAV_ROUTES }, ({ routes }) =>
  routes.find('kepler'),
);

export default function Missing() {
  return null;
}
