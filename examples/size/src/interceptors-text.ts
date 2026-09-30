import { Nexus } from '@nexusdi/core';

import { App, UserService } from './app.ts';

// The export keeps the pack in the bundle, so the figure is the pack alone.
// An app registers it with `errors({ text: [interceptorsText] })`.
export { interceptorsText } from '@nexusdi/interceptors/text';

const app = await Nexus.create(App);
app.get(UserService).logger.log('ready');
