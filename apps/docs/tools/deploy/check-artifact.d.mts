export function checkArtifact(
  site: string,
  mode: string,
  options?: { allowProbe?: boolean; posts?: string[] },
): string[];
export function siteCounts(site: string): Record<string, number>;
