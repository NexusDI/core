import { useLoaderData } from 'react-router';

import { di } from '../nexus.server';
import { NAV_ROUTES, Navigation } from '../ship';
import type { Route } from './+types/navigation';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: Route.LoaderArgs) => ({
    route: routes.find(params.sector),
  }),
);

export default function Nav() {
  return <p id="route">{useLoaderData<typeof loader>().route}</p>;
}
