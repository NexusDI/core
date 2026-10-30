export function buildDispatch(
  outDir: string,
): Promise<{ on: string; off: string }>;

export function buildPlanted(outDir: string): Promise<string>;
