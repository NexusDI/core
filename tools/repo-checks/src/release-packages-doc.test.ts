import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/**
 * RELEASING.md and the release skill list the packages one release
 * publishes. A package added under libs/ without a line there is a package
 * the owner was never told to bootstrap, and its first rc publish fails on
 * npm's OIDC exchange (RELEASING.md, "Bootstrapping a new package").
 */
const libs = readdirSync(join(workspaceRoot, 'libs')).filter((dir) =>
  existsSync(join(workspaceRoot, 'libs', dir, 'package.json')),
);
const published = libs
  .map(
    (dir) =>
      JSON.parse(
        readFileSync(join(workspaceRoot, 'libs', dir, 'package.json'), 'utf8'),
      ) as { name: string; private?: boolean },
  )
  .filter((pkg) => pkg.private !== true)
  .map((pkg) => pkg.name.replace('@nexusdi/', ''));

describe.each([['RELEASING.md'], ['.claude/skills/nexusdi-release/SKILL.md']])(
  '%s',
  (file) => {
    const text = readFileSync(join(workspaceRoot, file), 'utf8');
    const section = /## Packages\n([\s\S]*?)\n## /.exec(text)?.[1] ?? '';

    it('lists every published package under libs/', () => {
      for (const name of published)
        expect(section, name).toMatch(new RegExp(`\`(@nexusdi/)?${name}\``));
    });

    it('states the package count', () => {
      expect(section).toMatch(
        new RegExp(`publishes ${published.length} packages`),
      );
    });
  },
);
