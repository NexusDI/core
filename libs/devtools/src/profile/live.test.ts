import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { liveSink } from '../live.js';

describe('liveSink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws nothing outside Chromium 134 and later', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '133' }] },
    });
    expect(liveSink()).toBeUndefined();
    vi.stubGlobal('navigator', undefined);
    expect(liveSink()).toBeUndefined();
  });

  it('calls console.timeStamp per span and swallows its errors', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '134' }] },
    });
    // Node's timeStamp records nothing, so the test stubs one.
    const stamp = vi.fn(() => {
      throw new Error('no recorder');
    });
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    const sink = defined(liveSink());
    expect(() =>
      sink(
        {
          id: 0,
          kind: 'create',
          scope: null,
          ok: true,
          startMs: 0,
          durationMs: 1,
          compile: null,
          steps: [],
          builds: [],
          inits: [],
          pending: [],
        },
        null,
      ),
    ).not.toThrow();
    expect(stamp).toHaveBeenCalledWith(
      'create',
      0,
      1,
      'Runs',
      'NexusDI',
      'secondary-dark',
    );
  });
  it('draws in the track group it is given', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '154' }] },
    });
    // Node's timeStamp records nothing, so the test stubs one.
    const stamp = vi.fn();
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    defined(liveSink({ trackGroup: 'Ship' }))(
      {
        id: 0,
        kind: 'create',
        scope: null,
        ok: true,
        startMs: 0,
        durationMs: 1,
        compile: null,
        steps: [],
        builds: [],
        inits: [],
        pending: [],
      },
      null,
    );
    expect(stamp).toHaveBeenCalledWith(
      'create',
      0,
      1,
      'Runs',
      'Ship',
      'secondary-dark',
    );
  });
  it('is the module the @nexusdi/devtools/live subpath exports', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, Record<string, string>> };
    expect(manifest.exports['./live']).toEqual({
      '@nexusdi/source': './src/live.ts',
      types: './dist/live.d.ts',
      import: './dist/live.js',
      default: './dist/live.js',
    });
  });
});
