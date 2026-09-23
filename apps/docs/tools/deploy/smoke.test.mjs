// @vitest-environment node
import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkNotFound,
  checkResponse,
  runSmoke,
  smokeNotFoundTargets,
  smokeTargets,
} from './smoke.mjs';

describe('smokeTargets', () => {
  const origin = 'https://nexus.js.org';

  it('requests the root and the old feed in snapshot-only mode', () => {
    expect(smokeTargets('snapshot-only', origin)).toEqual([
      'https://nexus.js.org/',
      'https://nexus.js.org/blog/rss.xml',
    ]);
  });

  it('adds /next/ and its .md sibling in rc mode', () => {
    expect(smokeTargets('rc', origin)).toEqual([
      'https://nexus.js.org/',
      'https://nexus.js.org/blog/rss.xml',
      'https://nexus.js.org/next/',
      'https://nexus.js.org/next/getting-started.md',
    ]);
  });

  it('adds /v0.3/ and the root sibling in final mode', () => {
    expect(smokeTargets('final', origin)).toEqual([
      'https://nexus.js.org/',
      'https://nexus.js.org/blog/rss.xml',
      'https://nexus.js.org/next/',
      'https://nexus.js.org/next/getting-started.md',
      'https://nexus.js.org/getting-started.md',
      'https://nexus.js.org/v0.3/',
    ]);
  });

  it('drops /v0.3/ in retired mode', () => {
    expect(smokeTargets('retired', origin)).not.toContain(
      'https://nexus.js.org/v0.3/',
    );
  });
});

describe('smokeNotFoundTargets', () => {
  const origin = 'https://nexus.js.org';

  it('requires /next/ to 404 in snapshot-only mode', () => {
    expect(smokeNotFoundTargets('snapshot-only', origin)).toEqual([
      'https://nexus.js.org/next/',
    ]);
  });

  it('checks nothing once /next/ is a real site', () => {
    expect(smokeNotFoundTargets('rc', origin)).toEqual([]);
    expect(smokeNotFoundTargets('final', origin)).toEqual([]);
    expect(smokeNotFoundTargets('retired', origin)).toEqual([]);
  });
});

describe('checkResponse', () => {
  it('passes a 200 without an injected script', () => {
    expect(
      checkResponse('https://nexus.js.org/', 200, '<html></html>'),
    ).toEqual([]);
  });

  it('fails a status other than 200', () => {
    expect(checkResponse('https://nexus.js.org/next/', 404, '')).toEqual([
      'https://nexus.js.org/next/ answered 404.',
    ]);
  });

  it('fails a body that references /cdn-cgi/', () => {
    expect(
      checkResponse(
        'https://nexus.js.org/',
        200,
        '<script src="/cdn-cgi/scripts/rocket-loader.min.js"></script>',
      ),
    ).toEqual([
      'https://nexus.js.org/ carries /cdn-cgi/, so Cloudflare rewrote the HTML. Turn off Rocket Loader and every HTML-rewriting feature for the zone.',
    ]);
  });
});

describe('checkNotFound', () => {
  it('passes a 404', () => {
    expect(checkNotFound('https://nexus.js.org/next/', 404)).toEqual([]);
  });

  it('fails a status other than 404', () => {
    expect(checkNotFound('https://nexus.js.org/next/', 200)).toEqual([
      'https://nexus.js.org/next/ answered 200, not 404.',
    ]);
  });
});

describe('runSmoke against a local server', () => {
  let server;
  let origin;
  let flaky = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const path = new URL(request.url, 'http://x').pathname;
      if (path === '/') return response.writeHead(200).end('<html>root</html>');
      if (path === '/blog/rss.xml')
        return response.writeHead(200).end('<rss/>');
      if (path === '/injected/')
        return response
          .writeHead(200)
          .end('<script src="/cdn-cgi/x.js"></script>');
      if (path === '/flaky/') {
        flaky += 1;
        return response.writeHead(flaky < 3 ? 502 : 200).end('ok');
      }
      response.writeHead(404).end('missing');
    });
    await new Promise((resolve) => server.listen(0, resolve));
    origin = `http://localhost:${server.address().port}`;
  });

  afterAll(() => server.close());

  it('passes when every target answers 200', async () => {
    expect(
      await runSmoke(smokeTargets('snapshot-only', origin), fetch, {
        attempts: 1,
        delayMs: 0,
      }),
    ).toEqual([]);
  });

  it('retries a target until it answers', async () => {
    expect(
      await runSmoke([`${origin}/flaky/`], fetch, { attempts: 5, delayMs: 0 }),
    ).toEqual([]);
  });

  it('reports a missing page after its last attempt', async () => {
    expect(
      await runSmoke([`${origin}/next/`], fetch, { attempts: 2, delayMs: 0 }),
    ).toEqual([`${origin}/next/ answered 404.`]);
  });

  it('reports an injected script', async () => {
    expect(
      await runSmoke([`${origin}/injected/`], fetch, {
        attempts: 1,
        delayMs: 0,
      }),
    ).toEqual([
      `${origin}/injected/ carries /cdn-cgi/, so Cloudflare rewrote the HTML. Turn off Rocket Loader and every HTML-rewriting feature for the zone.`,
    ]);
  });

  it('passes a not-found target that really answers 404', async () => {
    expect(
      await runSmoke(
        [`${origin}/next/`],
        fetch,
        { attempts: 1, delayMs: 0 },
        checkNotFound,
      ),
    ).toEqual([]);
  });

  it('fails a not-found target that answers 200', async () => {
    expect(
      await runSmoke(
        [`${origin}/`],
        fetch,
        { attempts: 1, delayMs: 0 },
        checkNotFound,
      ),
    ).toEqual([`${origin}/ answered 200, not 404.`]);
  });
});
