import { isNexusError } from '@nexusdi/core';
import type { Course } from '@nexusdi/meridian-systems/charts';

import { data } from 'react-router';

import { refusalOf, type Refusal } from '../di/uncharted';
import { NAV_ROUTES, Navigation } from '../di/navigation.module';
import { di } from '../nexus.server';
import type { Route } from './+types/sectors';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];

/**
 * The course to the sector, or the refusal with status 404 for a star the
 * charts do not hold.
 */
export const loader: (
  args: Route.LoaderArgs,
) => Promise<
  { route: Course } | ReturnType<typeof data<{ refusal: Refusal }>>
> = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: Route.LoaderArgs) => {
    try {
      return { route: routes.find(params.sector) };
    } catch (error) {
      if (!isNexusError(error, 'MERIDIAN_UNCHARTED')) throw error;
      return data({ refusal: refusalOf(error) }, { status: 404 });
    }
  },
);

export default function Sector({ loaderData }: Route.ComponentProps) {
  if ('refusal' in loaderData) {
    const { code, message, fix } = loaderData.refusal;
    return (
      <div role="alert">
        <p>{`${code}: ${message}`}</p>
        {fix === undefined ? null : <p>{`Fix: ${fix}`}</p>}
      </div>
    );
  }
  return <p>{`${loaderData.route.to}: heading ${loaderData.route.heading}`}</p>;
}
