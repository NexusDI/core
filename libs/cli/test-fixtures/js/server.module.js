import { createServer } from 'node:http';

// Leaves a listening handle open, as an entry that starts its app would.
createServer().listen(0);

export { Meridian as default } from './meridian.module.js';
