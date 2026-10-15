import { useLoaderData } from 'react-router';

import { ambient, scopes } from '../nexus.server';
import { NAV_ROUTES, Navigation } from '../ship';
import type { Route } from './+types/ambient-navigation';

// The ambient scope exists before this route's middleware loads the module,
// so di.load extends it, and scopes.current() stays the same scope.
const navigation = ambient.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader = navigation.inject(
  { routes: NAV_ROUTES },
  async ({ routes }, { params, context }: Route.LoaderArgs) => ({
    route: routes.find(params.sector),
    same: scopes.current() === (await ambient.scope(context)),
  }),
);

export default function AmbientNav() {
  const { route, same } = useLoaderData<typeof loader>();
  return (
    <p id="route">
      {route} {String(same)}
    </p>
  );
}
