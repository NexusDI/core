import { createRequire } from 'node:module';

import type { Config } from '@react-router/dev/config';

// The adapter-peers job (spec 13.4) installs React Router 7.9.0 and latest 7.x
// over the workspace. On 7.x, middleware needs the v8_middleware flag; on 8.x
// it is always on and the flag is gone.
const { version } = createRequire(import.meta.url)(
  'react-router/package.json',
) as { version: string };
const seven = version.startsWith('7.');

export default {
  ssr: true,
  ...(seven ? { future: { v8_middleware: true } } : {}),
} satisfies Config;
