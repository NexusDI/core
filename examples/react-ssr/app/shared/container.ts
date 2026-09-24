import { Nexus } from '@nexusdi/core';
import { createContext } from 'react-router';
import type { Route } from '../+types/root';
import { AppModule } from './app.module';

// One container per server process. Nexus.create is async, so the promise is
// made once, at import, and each request awaits it.
const ship = Nexus.create(AppModule);
// A startup failure surfaces on the first request's await. This handler keeps
// it from also being reported as an unhandled rejection at import time.
ship.catch(() => undefined);

export const containerContext = createContext<Nexus>();

// Container middleware: gives downstream middleware and loaders the container.
export const containerMiddleware: Route.MiddlewareFunction = async (
  { context },
  next,
) => {
  context.set(containerContext, await ship);
  return next();
};
