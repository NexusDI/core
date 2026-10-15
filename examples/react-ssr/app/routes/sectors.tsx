import type { Course } from '@nexusdi/bridge-api/contracts';

import { NAV_ROUTES } from '../navigation/navigation.module';
import { di, Navigation } from '../nexus.server';
import type { Route } from './+types/sectors';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader: (args: Route.LoaderArgs) => Promise<{ route: Course }> =
  navigation.inject(
    { routes: NAV_ROUTES },
    ({ routes }, { params }: Route.LoaderArgs) => ({
      route: routes.find(params.sector),
    }),
  );

export default function Sector({ loaderData }: Route.ComponentProps) {
  return <p>{`${loaderData.route.to}: heading ${loaderData.route.heading}`}</p>;
}
