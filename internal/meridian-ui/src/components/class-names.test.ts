import { describe, expect, it } from 'vitest';

import { cx } from './class-names.js';

describe('cx', () => {
  it('joins the class names that are strings', () => {
    expect(cx('meridian-panel', false, null, undefined, 'x')).toBe(
      'meridian-panel x',
    );
  });

  it('returns an empty string when nothing is set', () => {
    expect(cx(false, undefined)).toBe('');
  });
});
