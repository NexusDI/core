import { Nexus } from '@nexusdi/core';

import { App, UserService } from './app.ts';

// The export keeps the pack in the bundle, so the figure is the pack alone.
// An app registers it with `errors({ text: [federationText] })`.
export { federationText } from '@nexusdi/federation/text';

const app = await Nexus.create(App);
app.get(UserService).logger.log('ready');
