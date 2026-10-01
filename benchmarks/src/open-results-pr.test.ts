import { describe, expect, it } from 'vitest';

import { resultsBase } from './open-results-pr.ts';

describe('resultsBase', () => {
  it('targets the branch of a dispatched or scheduled run', () => {
    expect(resultsBase(false, 'release/0.4', [])).toBe('release/0.4');
    expect(resultsBase(false, 'main', [])).toBe('main');
  });
  it('targets the release line of an rc tag', () => {
    expect(
      resultsBase(true, '@nexusdi/core@0.4.0-rc.0', [
        'release/0.4',
        'feat/core-0.4',
      ]),
    ).toBe('release/0.4');
  });
  it('targets the release line of an rc tag that main also contains', () => {
    expect(
      resultsBase(true, '@nexusdi/core@0.4.0-rc.1', ['main', 'release/0.4']),
    ).toBe('release/0.4');
  });
  it('targets main for a stable release, which fast-forwards main', () => {
    expect(
      resultsBase(true, '@nexusdi/core@0.4.0', ['main', 'release/0.4']),
    ).toBe('main');
  });
  it('targets the maintenance line of a patch tagged on X.Y.x', () => {
    expect(resultsBase(true, '@nexusdi/core@0.3.3', ['0.3.x'])).toBe('0.3.x');
  });
  it('throws when no release branch contains the tag', () => {
    expect(() =>
      resultsBase(true, '@nexusdi/core@0.4.0-rc.0', ['feat/core-0.4']),
    ).toThrow(/release\/0\.4/);
  });
});
