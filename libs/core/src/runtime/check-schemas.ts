import type { Blueprint } from '../blueprint/blueprint.js';
import { BlueprintError, type ModuleOptionsError } from '../errors/index.js';
import {
  isThenable,
  moduleName,
  observeRejection,
  optionsError,
} from './build.js';
import type { CheckReport } from './options.js';

/**
 * check()'s options pass over the last compiled blueprint: judges
 * each schema result of a forRoot() value that comes back synchronously,
 * and returns the async schemas and the forRootAsync() modules it could
 * not judge. Throws one BlueprintError for every rejected value, in
 * record order. A schema that throws propagates.
 */
export function checkSchemas(bp: Blueprint): CheckReport['unchecked'] {
  const unchecked: CheckReport['unchecked'][number][] = [];
  const rejected: ModuleOptionsError[] = [];
  for (const record of bp.providers.values()) {
    if (record.schema === undefined) continue;
    const module = moduleName(bp, record);
    if (record.kind === 'factory') {
      unchecked.push(Object.freeze({ module, reason: 'for-root-async' }));
      continue;
    }
    const result = record.schema['~standard'].validate(record.value);
    if (isThenable(result)) {
      observeRejection(result);
      unchecked.push(Object.freeze({ module, reason: 'async-schema' }));
      continue;
    }
    const error = optionsError(record, bp, result);
    if (error !== undefined) rejected.push(error);
  }
  if (rejected.length > 0) throw new BlueprintError(rejected);
  return Object.freeze(unchecked);
}
