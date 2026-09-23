/** A short description of any value, for the `received` field of an error. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return `the string ${JSON.stringify(value)}`;
    case 'number':
    case 'boolean':
    case 'bigint':
      return `the ${typeof value} ${String(value)}`;
    case 'symbol':
      return `the symbol ${String(value)}`;
    case 'function':
      return `the function ${value.name || '(anonymous)'}`;
    default:
      return Array.isArray(value) ? 'an array' : 'an object';
  }
}
