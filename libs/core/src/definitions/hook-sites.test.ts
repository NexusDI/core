import { describe, expect, it } from 'vitest';

import * as core from '../index.js';
import { HOOK_SITES } from './hook-sites.js';

describe('HOOK_SITES', () => {
  it('is on in every build core publishes', () => {
    expect(HOOK_SITES).toBe(true);
  });
  it('stays out of the public entry', () => {
    expect(Object.keys(core)).not.toContain('HOOK_SITES');
  });
});
