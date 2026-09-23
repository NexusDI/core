import { describe, expect, it } from 'vitest';

import { errorCases } from '../../test-support/error-cases.js';
import { BlueprintError } from '../errors/index.js';

describe('R19', () => {
  it('starts every error message with its code exactly once', () => {
    for (const { error, code } of errorCases) {
      expect(error.message.startsWith(`[${code}] `)).toBe(true);
      expect(error.message.indexOf(`[${code}]`, 1)).toBe(-1);
      if (error instanceof BlueprintError) {
        // Each nested error keeps its own single prefix on its own line.
        for (const nested of error.errors) {
          expect(error.message).toContain(`\n  [${nested.code}] `);
        }
      }
    }
  });
});
