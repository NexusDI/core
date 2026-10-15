import type { Scope } from '@nexusdi/core';

import type { ClosableRequestScope, ScopeRunner } from './request-scope.js';

/**
 * The body wrapper of integrations spec 3.4. A framework that returns the
 * Response before it writes the body (Hono, React Router) disposes the
 * request's scope here: when the body ends, errors or is cancelled. A
 * response with no body to read disposes at once and is returned as is.
 */
const NO_BODY = new Set([101, 204, 205, 304]);

export function disposeWithBody(
  response: Response,
  dispose: () => Promise<void>,
  method: string,
): Response {
  if (
    response.body === null ||
    method === 'HEAD' ||
    NO_BODY.has(response.status)
  ) {
    void dispose();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          void dispose();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        void dispose();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        void dispose();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** The status of a response whose client has gone. Nobody reads it. */
export const CLIENT_GONE = 499;

/**
 * The middleware path of an adapter that returns the Response before its
 * body is written. A client gone before the middleware ran gets no scope
 * and a CLIENT_GONE response. An abort later disposes the request. With
 * `scopes`, the rest of the request runs inside the ambient scope, and a
 * failure to create it goes to `fail`. The response that comes back
 * disposes the scope when its body ends (disposeWithBody).
 */
export async function serveWithBody(step: {
  readonly request: Request;
  readonly handle: ClosableRequestScope;
  readonly dispose: () => Promise<void>;
  readonly scopes: ScopeRunner | undefined;
  readonly ambient: (
    handle: ClosableRequestScope,
    dispose: () => Promise<void>,
  ) => Promise<{ readonly scope: Scope } | { readonly failure: unknown }>;
  readonly next: () => Promise<Response>;
  readonly fail: (failure: unknown) => never;
}): Promise<Response> {
  const { request, handle, dispose, scopes } = step;
  if (request.signal.aborted) {
    await dispose(); // the client left before the middleware ran: no scope, no handler
    return new Response(null, { status: CLIENT_GONE });
  }
  request.signal.addEventListener('abort', () => void dispose(), {
    once: true,
  });
  let response: Response;
  if (scopes !== undefined) {
    const started = await step.ambient(handle, dispose);
    if ('failure' in started) step.fail(started.failure);
    response = await scopes.run(started.scope, step.next);
  } else {
    response = await step.next(); // the handlers create the scope on first use
  }
  return disposeWithBody(response, dispose, request.method);
}
