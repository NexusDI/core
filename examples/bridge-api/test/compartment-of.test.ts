import { describe, expect, it } from 'vitest';

import { compartmentOf } from '../src/bridge/compartment-of';

describe('compartmentOf', () => {
  it('reads the compartment of an atmosphere path', () => {
    expect(compartmentOf('/compartments/habitat/atmosphere')).toBe('habitat');
  });

  it('stops at a query string', () => {
    expect(compartmentOf('/compartments/airlock?x=1')).toBe('airlock');
  });

  it('keeps the id as the path spells it, undecoded', () => {
    expect(compartmentOf('/compartments/reactor%2Dbay/atmosphere')).toBe(
      'reactor%2Dbay',
    );
  });

  it('reads the prefix in its own case only, as every entry routes it', () => {
    expect(compartmentOf('/Compartments/habitat/atmosphere')).toBeUndefined();
  });

  it('gives undefined for a path outside /compartments', () => {
    expect(compartmentOf('/sim')).toBeUndefined();
    expect(compartmentOf('/compartments/')).toBeUndefined();
    expect(compartmentOf('/deck/compartments/habitat')).toBeUndefined();
  });
});
