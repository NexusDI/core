import { profile } from '@nexusdi/devtools';
import { liveSink } from '@nexusdi/devtools/live';

import { startProfiled } from './profiled.ts';

await startProfiled(profile({ live: liveSink() }));
