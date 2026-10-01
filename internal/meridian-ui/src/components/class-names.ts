/** Joins the class names that are strings, in order, with one space. */
export function cx(
  ...parts: readonly (string | false | null | undefined)[]
): string {
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}
