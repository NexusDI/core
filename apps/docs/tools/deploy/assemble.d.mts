export interface AssembleInput {
  mode: 'snapshot-only' | 'rc' | 'final' | 'retired';
  site: string;
  nextOut?: string;
  rootOut?: string;
  snapshotRoot: string;
  snapshotArchive?: string;
  legacyPosts?: { legacyUrl: string; slug: string }[];
  probe?: string;
}
export function assemble(input: AssembleInput): { files: number };
export function rootNotFoundScript(): string;
export function stubHtml(target: string): string;
export function siteFiles(dir: string): string[];
