import { describe, expect, it } from 'vitest';

import { captionOf, checkLines, launchLines } from './terminal';

describe('the terminal lines', () => {
  it('prints the shell, the output and the exit of a passing check', () => {
    expect(checkLines({ ok: true, error: null })).toEqual([
      { source: 'shell', text: '$ npm run preflight' },
      { source: 'node', text: 'pre-flight ok' },
      { source: 'shell', text: 'exit 0', status: 'ok' },
    ]);
  });

  it('prints the cause of a failed startup first, then the error', () => {
    const lines = launchLines({
      ok: false,
      readout: null,
      lookup: null,
      startupMs: null,
      error: {
        kind: 'provider-failed',
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'NavCharts',
        module: 'Tactical',
        message: '[NEXUS_PROVIDER_FAILED] NavCharts failed',
        cause: { message: 'chart server unreachable' },
      },
    });
    expect(lines[0]).toMatchObject({
      source: 'cause',
      text: 'chart server unreachable',
    });
    expect(lines.at(-1)).toMatchObject({ text: 'exit 1', status: 'alarm' });
    expect(
      lines.some((line) => line.codes?.includes('NEXUS_PROVIDER_FAILED')),
    ).toBe(true);
  });

  it('captions only the two outcomes the check cannot foresee', () => {
    expect(captionOf(null)).toBeNull();
    expect(
      captionOf({
        ok: true,
        error: null,
        readout: 'x',
        lookup: null,
        startupMs: 1,
      }),
    ).toBeNull();
  });
});
