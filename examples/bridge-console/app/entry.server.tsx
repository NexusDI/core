import { PassThrough } from 'node:stream';

import type { EntryContext, RouterContextProvider } from 'react-router';
import { NexusProvider } from '@nexusdi/react';
import { NEXUS_SCOPE } from '@nexusdi/react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';

import { ship } from './nexus.server';

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // The request scope di.middleware set. React Router renders a request no
  // route matches without the root middleware, so the slot is null and the
  // page renders with no request scope.
  const scope = await loadContext.get(NEXUS_SCOPE)?.scope();
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');

    // A bot gets the whole page at once, and so does a SPA mode render.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? 'onAllReady'
        : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <NexusProvider container={ship} scope={scope}>
        <ServerRouter context={routerContext} url={request.url} />
      </NexusProvider>,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // An error before the shell renders rejects the request promise,
          // and React Router logs it there.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    // The extra second lets the abort flush the boundaries that rejected.
    setTimeout(abort, streamTimeout + 1000);
  });
}
