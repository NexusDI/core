import { isNexusError } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import {
  nestedScope,
  noProvider,
  sectionConflict,
  sectionFailed,
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
      [
        sectionFailed('navigation', new Error('remote down')),
        'NEXUS_REACT_SECTION_FAILED',
      ],
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

  it('keeps the load error as the cause of NEXUS_REACT_SECTION_FAILED', () => {
    const down = new Error('remote down\nat the remote');
    const error = sectionFailed('navigation', down);
    expect(error.cause).toBe(down);
    expect(error.message.split('\n').slice(0, 3)).toEqual([
      "[NEXUS_REACT_SECTION_FAILED] Section 'navigation' failed to load:",
      '    remote down',
      '    at the remote',
    ]);
    expect(sectionFailed('navigation', 'offline').message).toContain(
      '\n    offline\n',
    );
    expect(sectionFailed('navigation', new TypeError('')).message).toContain(
      '\n    TypeError\n',
    );
    expect(sectionFailed('navigation', Object.create(null)).message).toContain(
      '\n    a value without a string form\n',
    );
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
