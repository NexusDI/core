import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { start, urlOf } from './entry-process';

describe.concurrent('the Node server entries', () => {
  it.for(['server.hono.ts', 'server.express.ts', 'server.fastify.ts'])(
    '%s prints its URL, serves /health and exits 0 on SIGTERM',
    async (entry, { onTestFinished }) => {
      const child = start(entry, onTestFinished);

      const { url, port } = await urlOf(child);
      expect(port).not.toBe(0);
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');

      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code, signal] = await exited;
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    },
  );
});
