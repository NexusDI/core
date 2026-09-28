import type { NexusPlugin } from '../src/index.js';
import { textOf } from '../src/text/index.js';

/** R5 to R7: revision 1's text, as a plugin, until @nexusdi/errors exists. */
export function textPlugin(): NexusPlugin {
  return {
    name: 'test:text',
    apiVersion: 1,
    formatError: (error, view) => textOf(error, view),
  };
}
