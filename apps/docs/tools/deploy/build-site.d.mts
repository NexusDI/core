export interface BuildPlan {
  env: Record<string, string>;
  copies: { from: string; to: string }[];
  commands: string[][];
}
export const COMMANDS: string[][];
export function buildPlan(
  kind: 'next' | 'root',
  dirs: { tree: string; main?: string },
): BuildPlan;
