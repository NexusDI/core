import { describe, expect, it } from 'vitest';

import type { BlueprintView, ErrorTextKit, NearMiss } from '../index.js';
import { InvalidModuleError, MissingProviderError, Token } from '../index.js';
import { coreText } from '../text/index.js';

interface INavCharts {
  plot(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const KIT_MISS: NearMiss = { kind: 'not-imported', module: 'Tactical' };

/** A kit that records each lookup and answers with one near miss. */
function kit(calls: unknown[][] = []): ErrorTextKit {
  return {
    nearMisses: (token, moduleId) => {
      calls.push([token, moduleId]);
      return [KIT_MISS];
    },
  };
}

// The pack reads the view only to learn that one exists; the kit does the search.
const view = {} as BlueprintView;

function missingProvider(nearMisses: readonly NearMiss[] = []) {
  return new MissingProviderError(
    {
      token: 'NavCharts',
      requester: null,
      module: 'Meridian',
      entry: null,
      nearMisses,
    },
    { hidden: { lookup: { token: NAV_CHARTS, moduleId: 'm1' } } },
  );
}

describe('coreText', () => {
  it('asks the kit for the near misses of a core lookup, given a view', () => {
    const calls: unknown[][] = [];
    const text = coreText.NEXUS_MISSING_PROVIDER(
      missingProvider(),
      view,
      kit(calls),
    );
    expect(calls).toEqual([[NAV_CHARTS, 'm1']]);
    expect(text.nearMisses).toEqual([KIT_MISS]);
    expect(text.message).toContain(
      'NavCharts is exported by Tactical, which Meridian does not import.',
    );
  });

  it("returns the error's own near misses without a view", () => {
    const own: NearMiss = { kind: 'not-exported', module: 'Science' };
    const calls: unknown[][] = [];
    const text = coreText.NEXUS_MISSING_PROVIDER(
      missingProvider([own]),
      undefined,
      kit(calls),
    );
    expect(calls).toEqual([]);
    expect(text.nearMisses).toEqual([own]);
    expect(text.message).toContain(
      'NavCharts is provided in Science, which does not export it.',
    );
  });

  it('names the second copy of core for a value another copy made', () => {
    const text = coreText.NEXUS_INVALID_MODULE(
      new InvalidModuleError({
        received: 'an object',
        path: ['Shell'],
        otherCopy: true,
      }),
    );
    expect(text.message).toContain('another copy of @nexusdi/core');
  });
});
