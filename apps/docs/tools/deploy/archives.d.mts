export type ArchiveEntry =
  | { line: '0.3'; kind: 'snapshot' }
  | { line: string; kind: 'tag'; tag: string };

export interface Archives {
  archives: ArchiveEntry[];
}

export function validateArchives(
  archives: unknown,
  deployConfig: unknown,
): string[];
export function readArchives(path: string): Archives;
