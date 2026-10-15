import { Links, Meta, Outlet, Scripts } from 'react-router';

import { middleware as nexusMiddleware } from './nexus.server';
import type { Route } from './+types/root';

export const middleware: Route.MiddlewareFunction[] = [nexusMiddleware];

export default function Root() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const response = error as { status?: number; statusText?: string };
  return (
    <p id="boundary">
      {response.status} {response.statusText}
    </p>
  );
}
