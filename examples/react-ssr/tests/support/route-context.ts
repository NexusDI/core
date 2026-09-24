import {
  defineModule,
  Nexus,
  provide,
  type ProviderEntry,
} from '@nexusdi/core';
import type { RouterContext } from 'react-router';
import {
  LOGGER_SERVICE_TOKEN,
  type ILoggerService,
} from '../../app/modules/logger/logger.types';
import {
  USER_SERVICE_TOKEN,
  type IUserService,
} from '../../app/modules/users/users.types';
import { containerContext } from '../../app/shared/container';

/** A router context holding a container with the given fakes, as the loaders read it. */
export async function routeContext(services: {
  logger?: ILoggerService;
  users?: IUserService;
}): Promise<Map<RouterContext, unknown>> {
  const providers: ProviderEntry[] = [];
  if (services.logger)
    providers.push(
      provide(LOGGER_SERVICE_TOKEN, { useValue: services.logger }),
    );
  if (services.users)
    providers.push(provide(USER_SERVICE_TOKEN, { useValue: services.users }));
  const container = await Nexus.create(
    defineModule({ name: 'RouteTest', providers }),
  );
  return new Map<RouterContext, unknown>([[containerContext, container]]);
}
