import type { devtools } from '@acme/devtools';

export const load = async (file: string) =>
  (await import(file)) as typeof devtools;
