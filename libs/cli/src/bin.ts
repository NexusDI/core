#!/usr/bin/env node
import { main } from './main.js';

// A failed write also emits 'error', and a stream with no listener throws it.
// writeTo gets the same error through its callback and handles it there.
process.stdout.on('error', () => undefined);
process.stderr.on('error', () => undefined);

// process.exit once the output is flushed: an entry that starts a server
// leaves open handles that would otherwise keep the CLI alive. main rejects
// only when it cannot write its error to stderr, which leaves 2.
void main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
}).then(
  (code) => process.exit(code),
  () => process.exit(2),
);
