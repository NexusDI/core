#!/usr/bin/env node
import { main } from './main.js';

// process.exit once the output is flushed: an entry that starts a server
// leaves open handles that would otherwise keep the CLI alive.
void main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
}).then((code) => process.exit(code));
