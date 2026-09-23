import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';

/** The docs app. */
export const DOCS = join(workspaceRoot, 'apps/docs');

/** The content tree Nextra compiles. */
export const CONTENT = join(DOCS, 'content');

/** Where every guard keeps its clean and sabotaged fixture trees. */
export const FIXTURES = join(import.meta.dirname, '..', '__fixtures__', 'docs');
