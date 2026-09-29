/**
 * Runs a library's snippets module: COMPUTER resolved with the real
 * reactor, then with the fake. Prints one JSON line.
 */
import { pathToFileURL } from 'node:url';

const m = await import(pathToFileURL(process.argv[2]).href);
const real = await m.resolveComputer();
const fake = await m.resolveComputerWithFake();
console.log(
  JSON.stringify({ real: real.reactor.kind, fake: fake.reactor.kind }),
);
