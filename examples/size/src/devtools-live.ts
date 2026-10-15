import { Nexus } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';
import { liveSink } from '@nexusdi/devtools/live';

import { App, UserService } from './app.ts';

const profiler = profile({ live: liveSink() });
const app = await Nexus.create(App, { plugins: [profiler] });
app.get(UserService).logger.log('ready');
console.log(profiler.report().runs.length);
