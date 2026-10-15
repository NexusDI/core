import { Links, Meta, Outlet, Scripts } from 'react-router';

import { di } from './nexus.server';

export const middleware = [di.middleware];

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
