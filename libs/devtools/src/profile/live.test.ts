import { afterEach, describe, expect, it, vi } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { liveSink } from './live.js';

describe('liveSink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws nothing outside Chromium 134 and later', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '133' }] },
    });
    expect(liveSink('NexusDI')).toBeUndefined();
    vi.stubGlobal('navigator', undefined);
    expect(liveSink('NexusDI')).toBeUndefined();
  });

  it('calls console.timeStamp per span and swallows its errors', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '134' }] },
    });
    // Node's console has no timeStamp to spy on, so the test stubs one.
    const stamp = vi.fn(() => {
      throw new Error('no recorder');
    });
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    const sink = defined(liveSink('NexusDI'));
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
});
