import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseJson, workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * libs/core lints with zero warnings. Its lint target passes
 * --max-warnings=0 to eslint, so a warning fails CI like an error; this
 * check keeps the flag from being dropped with a project.json edit.
 */
describe('libs/core lint target', () => {
  it('fails on any warning', () => {
    const project = parseJson<{
      targets?: { lint?: { options?: { args?: string[] } } };
    }>(readFileSync(join(workspaceRoot, 'libs/core/project.json'), 'utf-8'));
    expect(project.targets?.lint?.options?.args ?? []).toContain(
      '--max-warnings=0',
    );
  });
});
