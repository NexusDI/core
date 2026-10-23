import type { StandardSchemaV1 } from '@nexusdi/core';

/** Formats a refused value for an issue message: strings quoted. */
export const shown = (value: unknown) =>
  typeof value === 'string' ? JSON.stringify(value) : String(value);

/**
 * Builds the StandardSchema a module's `forRoot()` options pass through.
 * `shape` names the expected object in the message for a non-object. `check`
 * reads the fields and returns one issue per refused field. `build` makes the
 * validated options once `check` returns no issue.
 */
export const optionsSchema = <T>(
  shape: string,
  check: (fields: Record<string, unknown>) => StandardSchemaV1.Issue[],
  build: (fields: Record<string, unknown>) => T,
): StandardSchemaV1<unknown, T> => ({
  '~standard': {
    version: 1,
    vendor: 'meridian-systems',
    validate(value) {
      if (typeof value !== 'object' || value === null) {
        return {
          issues: [
            { message: `expected an object ${shape}, got ${shown(value)}` },
          ],
        };
      }
      const fields = value as Record<string, unknown>;
      const issues = check(fields);
      return issues.length > 0 ? { issues } : { value: build(fields) };
    },
  },
});
