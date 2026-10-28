/** The parts of a Node `http.Server` that `stopOnSigterm` uses. */
export interface StoppingServer {
  close(): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
  on(
    event: 'request',
    listener: (
      request: unknown,
      response: { once(event: 'finish', listener: () => void): unknown },
    ) => void,
  ): unknown;
}

/**
 * On SIGTERM, calls `close` (default `server.close()`) to stop the server
 * taking connections, then aborts `shutdown`, which ends every open
 * `GET /telemetry` stream with `ship offline`. The server waits for the
 * requests in flight, so each one answers with the ship still running. The
 * entry disposes the ship once the server has closed. `server.close()`
 * closes only the connections idle when it runs, so each response that
 * finishes after SIGTERM calls `server.closeIdleConnections()`. Without that
 * call, a keep-alive connection holds the server open until the client's or
 * the server's keep-alive timeout ends it (5 seconds on Node, 72 on
 * Fastify). After `drain` milliseconds (default 10 000),
 * `server.closeAllConnections()` ends the connections still open, such as
 * one that never sent a request (nodejs/node#63452). The timer keeps no
 * process alive. An entry calls this before its server takes a request. A
 * throw or a rejection from `close` goes to the console and sets exit code 1.
 */
export function stopOnSigterm(
  server: StoppingServer,
  shutdown: AbortController,
  {
    close = () => server.close(),
    drain = 10_000,
    signals = process,
  }: {
    close?: () => unknown;
    drain?: number;
    signals?: { once(event: 'SIGTERM', listener: () => void): unknown };
  } = {},
): void {
  server.on('request', (_, response) =>
    response.once('finish', () => {
      if (shutdown.signal.aborted) server.closeIdleConnections();
    }),
  );
  const report = (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  };
  signals.once('SIGTERM', () => {
    try {
      Promise.resolve(close()).catch(report);
    } catch (error) {
      report(error);
    }
    shutdown.abort();
    setTimeout(() => server.closeAllConnections(), drain).unref();
  });
}
