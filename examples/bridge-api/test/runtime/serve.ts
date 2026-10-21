// The two runtimes' server APIs, as far as this file calls them.
declare const Deno:
  | {
      serve(
        options: {
          port: number;
          hostname: string;
          onListen(address: { port: number }): void;
        },
        handler: (request: Request) => Response | Promise<Response>,
      ): { shutdown(): Promise<void> };
    }
  | undefined;
declare const Bun:
  | {
      serve(options: {
        port: number;
        hostname: string;
        fetch: (request: Request) => Response | Promise<Response>;
      }): { port: number; stop(force?: boolean): Promise<void> | void };
    }
  | undefined;

type Fetch = (request: Request) => Response | Promise<Response>;

/** Deno.serve(app.fetch) or Bun.serve({ fetch: app.fetch }), on a free port. */
export async function serve(fetch: Fetch) {
  if (typeof Deno !== 'undefined') {
    let server: { shutdown(): Promise<void> } | undefined;
    const port = await new Promise<number>((resolve) => {
      server = Deno.serve(
        { port: 0, hostname: '127.0.0.1', onListen: (a) => resolve(a.port) },
        fetch,
      );
    });
    return {
      url: `http://127.0.0.1:${port}`,
      close: async () => server?.shutdown(),
    };
  }
  if (typeof Bun !== 'undefined') {
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch });
    return {
      url: `http://127.0.0.1:${server.port}`,
      close: async () => server.stop(true),
    };
  }
  throw new Error('serve() runs under Deno or Bun');
}
