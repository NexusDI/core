import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('SECURITY.md', () => {
  it('lists exactly the identifiers the adversarial suite tests', () => {
    const register = readFileSync(
      join(HERE, '..', '..', 'SECURITY.md'),
      'utf8',
    );
    const listed = [...new Set(register.match(/SEC-\d{3}/g) ?? [])].sort();
    const suite = readdirSync(HERE)
      .filter(
        (file) => file.endsWith('.test.ts') && file !== 'register.test.ts',
      )
      .map((file) => readFileSync(join(HERE, file), 'utf8'))
      .join('\n');
    const tested = [
      ...new Set(
        [...suite.matchAll(/describe\('(SEC-\d{3})\b/g)].map((m) => m[1]!),
      ),
    ].sort();
    expect(tested).toEqual(listed);
  });
});
