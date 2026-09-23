import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { constructionStack } from './construction-stack.js';

describe('constructionStack', () => {
  const root = {};

  it('holds a frame while its function runs and pops it after', () => {
    const seen = constructionStack.run(
      { providerId: 'p0', container: root, name: 'ShipComputer' },
      () => constructionStack.names(),
    );
    expect(seen).toEqual(['ShipComputer']);
    expect(constructionStack.names()).toEqual([]);
  });

  it('pops the frame when the function throws', () => {
    thrown(() =>
      constructionStack.run(
        { providerId: 'p0', container: root, name: 'A' },
        () => {
          throw new Error('boom');
        },
      ),
    );
    expect(constructionStack.top()).toBeUndefined();
  });

  it('matches a frame by provider and container', () => {
    const scope = {};
    constructionStack.run(
      { providerId: 'p1', container: scope, name: 'Mission' },
      () => {
        expect(constructionStack.contains('p1', scope)).toBe(true);
        expect(constructionStack.contains('p1', root)).toBe(false);
      },
    );
  });

  it('reads the runtime cycle from the first frame of a provider to the top', () => {
    constructionStack.run(
      { providerId: 'p0', container: root, name: 'A' },
      () =>
        constructionStack.run(
          { providerId: 'p1', container: root, name: 'B' },
          () => {
            expect(constructionStack.cycleFrom('p0', root)).toEqual([
              'A',
              'B',
              'A',
            ]);
          },
        ),
    );
  });
});
