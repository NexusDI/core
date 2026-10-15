import { PassThrough } from 'node:stream';

import { NexusProvider } from '@nexusdi/react';
import { NEXUS_SCOPE } from '@nexusdi/react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import {
  RouterContextProvider,
  ServerRouter,
  type EntryContext,
} from 'react-router';

import { ship } from './nexus.server';

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // React Router 8 passes the middleware's context here (react spec 9.1).
  // The header lets the e2e test state it.
  if (!(loadContext instanceof RouterContextProvider))
    throw new Error('loadContext is not the RouterContextProvider');
  headers.set('x-load-context', 'RouterContextProvider');
  // React Router renders a request no route matches without the root
  // middleware, so the slot is null and the page renders with no scope.
  const scope = await loadContext.get(NEXUS_SCOPE)?.scope();
  const userAgent = request.headers.get('user-agent');
  const whole =
    (userAgent !== null && isbot(userAgent)) || routerContext.isSpaMode;

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const ready = () => {
      shellRendered = true;
      const body = new PassThrough();
      headers.set('Content-Type', 'text/html');
      resolve(
        new Response(createReadableStreamFromReadable(body), {
          status,
          headers,
        }),
      );
      pipe(body);
    };
    const { pipe, abort } = renderToPipeableStream(
      <NexusProvider container={ship} scope={scope}>
        <ServerRouter context={routerContext} url={request.url} />
      </NexusProvider>,
      {
        ...(whole ? { onAllReady: ready } : { onShellReady: ready }),
        onShellError: reject,
        onError(error: unknown) {
          status = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
    setTimeout(abort, streamTimeout + 1000);
  });
}
