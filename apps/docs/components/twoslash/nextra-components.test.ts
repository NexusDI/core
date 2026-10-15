import * as barrel from 'nextra/components/index';
import { describe, expect, it } from 'vitest';

import { Popup } from './LazyPopup';
import * as shim from './nextra-components';

/**
 * The shim `next.config.ts` aliases `nextra/components` to. It reaches the
 * real barrel through `nextra/components/index`, which Nextra's `./*` export
 * resolves; a Nextra release that moves the barrel breaks this file first.
 */
describe('the nextra/components shim', () => {
  it('exports every name the barrel exports', () => {
    expect(Object.keys(shim).sort()).toEqual(Object.keys(barrel).sort());
  });

  it('swaps in the lazy Popup, with its Button and Panel', () => {
    expect(shim.Popup).toBe(Popup);
    expect(shim.Popup).not.toBe(barrel.Popup);
    expect(typeof shim.Popup.Button).toBe('function');
    expect(typeof shim.Popup.Panel).toBe('function');
  });

  it('passes every other name through unchanged', () => {
    const others = Object.keys(barrel).filter((name) => name !== 'Popup');

    expect(others.length).toBeGreaterThan(10);
    for (const name of others)
      expect(shim[name as keyof typeof shim]).toBe(
        barrel[name as keyof typeof barrel],
      );
  });
});
