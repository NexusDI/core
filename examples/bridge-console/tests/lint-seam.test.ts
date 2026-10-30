// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));

/** The rule ids ESLint reports for `code` linted as `filePath` in the console. */
async function ruleIds(code: string, filePath: string) {
  const eslint = new ESLint({ cwd });
  const [result] = await eslint.lintText(code, {
    filePath: `${cwd}${filePath}`,
  });
  return result.messages.map((message) => message.ruleId);
}

describe('the MeridianOS seam', () => {
  it('rejects a component that imports @nexusdi/react', async () => {
    const ids = await ruleIds(
      "import { useService } from '@nexusdi/react';\nexport const x = useService;\n",
      'app/components/Probe.tsx',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('rejects a component that imports a @nexusdi/ subpath', async () => {
    const ids = await ruleIds(
      "import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';\nexport const x = NAV_CHARTS;\n",
      'app/components/Probe.tsx',
    );
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('allows a component to import a type from @nexusdi/*', async () => {
    const ids = await ruleIds(
      "import type { ShipReading } from '@nexusdi/meridian-systems';\nexport type X = ShipReading;\n",
      'app/components/Probe.tsx',
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });

  it('allows a component to import @nexusdi/meridian-ui and a subpath', async () => {
    const ids = await ruleIds(
      "import { Panel } from '@nexusdi/meridian-ui';\nimport { Dial } from '@nexusdi/meridian-ui/dial';\nexport const x = [Panel, Dial];\n",
      'app/components/Probe.tsx',
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });

  it('allows a hook to import @nexusdi/react', async () => {
    const ids = await ruleIds(
      "import { useService } from '@nexusdi/react';\nexport const x = useService;\n",
      'app/hooks/probe.ts',
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });
});
