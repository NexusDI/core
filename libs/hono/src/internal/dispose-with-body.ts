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
