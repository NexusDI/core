import { displayName } from '../definitions/token.js';
import type { ProviderRecord } from './blueprint.js';

const FORM = {
  class: 'useClass',
  value: 'useValue',
  factory: 'useFactory',
  alias: 'useExisting',
} as const;

/**
 * The name a message gives a contribution. A class record gives the class
 * name, and a factory with its own function name gives that name. Any other
 * record gives its form and its 1-based position among the records of the
 * same token in the same module, in provider order: `useValue #2`.
 * `records` holds every record of the compile in index order.
 */
export function contributionLabel(
  record: ProviderRecord,
  records: Iterable<ProviderRecord>,
): string {
  if (record.kind === 'class' && record.useClass !== undefined)
    return displayName(record.useClass);
  const name = record.useFactory?.name;
  if (
    record.kind === 'factory' &&
    name !== undefined &&
    name !== '' &&
    name !== 'useFactory'
  )
    return name;
  let position = 0;
  for (const other of records) {
    if (other.module === record.module && other.token === record.token)
      position += 1;
    if (other === record) break;
  }
  return `${FORM[record.kind]} #${position}`;
}
