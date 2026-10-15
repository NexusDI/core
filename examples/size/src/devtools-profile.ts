import { profile } from '@nexusdi/devtools';

import { startProfiled } from './profiled.ts';

await startProfiled(profile());
