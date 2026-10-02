import { defineConfig } from 'vite';

import { docExamples } from '@nexusdi/doc-examples';

export default defineConfig(() => ({ ...docExamples() }));
