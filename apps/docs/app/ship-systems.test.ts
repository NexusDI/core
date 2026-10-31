// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shipSystems } from './ship-systems';

describe('shipSystems', () => {
  it('starts with the pre-flight check on the front page', () => {
    expect(shipSystems[0]).toEqual({
      label: 'Pre-flight check',
      href: '/#pre-flight',
    });
  });

  it('links a page that exists for every other entry', () => {
    for (const { href } of shipSystems.slice(1)) {
      const slug = href.replaceAll('/', '');
      expect(
        existsSync(join(import.meta.dirname, '..', 'content', `${slug}.mdx`)),
        href,
      ).toBe(true);
    }
  });
});
