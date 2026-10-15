import { workspaceRoot } from '@nx/devkit';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Job {
  strategy?: {
    'fail-fast'?: boolean;
    matrix?: { include?: { lib: string; node: string }[] };
  };
  steps: { run?: string; uses?: string; 'working-directory'?: string }[];
}

const read = (path: string) => readFileSync(join(workspaceRoot, path), 'utf-8');
const ci = parse(read('.github/workflows/ci.yml')) as {
  jobs: Record<string, Job>;
};

/**
 * The Node a lib's tests run on: the floor of its engines range, except
 * react-router, whose React Router 8 peer needs 22.22.
 */
const FRAMEWORK_FLOORS: Record<string, string> = { 'react-router': '22.22.0' };

/** Every published lib under libs/ except cli, which has cli-node-floor, in folder order. */
function publishedLibs(): { lib: string; node: string }[] {
  return readdirSync(join(workspaceRoot, 'libs'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((lib) => {
      const pkg = JSON.parse(read(`libs/${lib}/package.json`)) as {
        private?: boolean;
        engines?: { node?: string };
      };
      if (pkg.private || lib === 'cli') return [];
      const floor = /^>=(\d+)\.(\d+)$/.exec(pkg.engines?.node ?? '');
      if (!floor) throw new Error(`libs/${lib} engines.node is not >=X.Y`);
      return [
        { lib, node: FRAMEWORK_FLOORS[lib] ?? `${floor[1]}.${floor[2]}.0` },
      ];
    });
}

describe('node-floor job', () => {
  const job = ci.jobs['node-floor'];

  it('runs every published lib but cli on the floor of its engines field', () => {
    expect(job?.strategy?.['fail-fast']).toBe(false);
    expect(job?.strategy?.matrix?.include).toEqual(publishedLibs());
  });

  it('runs vitest with the runner config loader, and no nx run-many', () => {
    const runs = (job?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('npx vitest run --configLoader runner');
    expect(runs).not.toContain('nx run-many');
  });
});
