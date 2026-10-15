import { isNexusError } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import {
  nestedScope,
  noProvider,
  sectionConflict,
  transientInRender,
} from './errors.js';

describe('the package errors', () => {
  it('raises each code with its fields and a docs link', () => {
    const cases = [
      [noProvider('useService'), 'NEXUS_REACT_NO_PROVIDER'],
      [
        transientInRender('DroneFactory', 'ScoutDrone'),
        'NEXUS_REACT_TRANSIENT_IN_RENDER',
      ],
      [nestedScope(), 'NEXUS_REACT_NESTED_SCOPE'],
      [sectionConflict('navigation'), 'NEXUS_REACT_SECTION_CONFLICT'],
    ] as const;
    for (const [error, code] of cases) {
      expect(isNexusError(error, code)).toBe(true);
      expect(error.message).toContain(`[${code}]`);
      expect(error.message).toContain('Fix:');
      expect(
        error.message.endsWith(`\n  Docs: https://nexus.js.org/errors/${code}`),
      ).toBe(true);
    }
  });

  it('keeps the fields as own enumerable properties', () => {
    expect({ ...transientInRender('DroneFactory', 'ScoutDrone') }).toEqual({
      token: 'DroneFactory',
      provider: 'ScoutDrone',
    });
    expect({ ...noProvider('useContainer') }).toEqual({ hook: 'useContainer' });
    expect({ ...sectionConflict('navigation') }).toEqual({
      section: 'navigation',
    });
  });
});
