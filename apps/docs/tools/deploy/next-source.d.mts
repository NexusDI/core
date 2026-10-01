export function pickNextSource(
  lsRemote: string,
  isAhead: (sha: string) => boolean,
): { branch: string; sha: string | null };
