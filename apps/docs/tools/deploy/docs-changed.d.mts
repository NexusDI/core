export const DOCS_YML_PATHS: string[];
export const EXTRA_PATHS: string[];
export const PATHS: string[];
export function touches(
  paths: readonly string[],
  files: readonly string[],
): boolean;
export function decide(
  base: string,
  diff?: (base: string) => string[],
): { touched: boolean; message: string };
