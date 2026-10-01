/**
 * Writes `src/tokens.generated.css` from the token modules. The file is
 * committed; `src/tokens-generated.test.ts` renders the same function and
 * compares byte for byte.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTokensCss } from '../src/tokens/custom-properties.js';

const target = join(import.meta.dirname, '..', 'src', 'tokens.generated.css');

writeFileSync(target, renderTokensCss(), 'utf8');
console.log(`wrote ${target}`);
