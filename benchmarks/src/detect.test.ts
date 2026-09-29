import { describe, expect, it } from 'vitest';

import { countReported, detectedAt } from './detect.ts';

const base = {
  typecheckFailed: false,
  buildOk: true,
  loadError: null,
  readyError: null,
  resolveError: null,
};

describe('detectedAt', () => {
  it('prefers typecheck', () => {
    expect(
      detectedAt({ ...base, typecheckFailed: true, readyError: 'x' }),
    ).toBe('typecheck');
  });
  it('reports create for an error before any resolve', () => {
    expect(detectedAt({ ...base, readyError: 'NEXUS_MISSING_PROVIDER' })).toBe(
      'create',
    );
  });
  it('reports first-resolve', () => {
    expect(detectedAt({ ...base, resolveError: 'No matching bindings' })).toBe(
      'first-resolve',
    );
  });
  it('reports never when everything ran', () => {
    expect(detectedAt(base)).toBe('never');
  });
});

describe('countReported', () => {
  it('counts both mistakes named in the first error', () => {
    expect(
      countReported('NavCharts missing; cycle PowerRouter -> ShieldGrid', [
        'NavCharts',
        'PowerRouter',
      ]),
    ).toBe(2);
    expect(
      countReported('NavCharts missing', ['NavCharts', 'PowerRouter']),
    ).toBe(1);
  });
});
