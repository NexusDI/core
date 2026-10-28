import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';

import type { Route } from './+types/root';
import './app.css';
import { di } from './nexus.server';

export const middleware: Route.MiddlewareFunction[] = [di.middleware];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

/** A page for a status error, such as the 404 of a path no route matches, and for any other failure. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const unexpected = 'An unexpected error occurred.';
  let title = 'Error';
  let details = unexpected;
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || unexpected;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{title}</h1>
      <p>{details}</p>
    </main>
  );
}
