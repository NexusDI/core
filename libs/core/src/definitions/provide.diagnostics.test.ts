import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '__provide_fixture__.ts');

const PREAMBLE = `
import { provide } from './provide.js';
import { Token } from './token.js';

class ReactorCore { output = 1.21; }
class ShipComputer { constructor(readonly reactor: ReactorCore) {} }
interface NavCharts { plot(to: string): string }
class SubspaceLink { download(path: string): NavCharts { return { plot: () => path }; } }
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const charts: NavCharts = { plot: (to) => to };
void [ReactorCore, ShipComputer, SubspaceLink, NAV_CHARTS, COMPUTER, charts];
`;

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: [
    'lib.es2022.d.ts',
    'lib.esnext.disposable.d.ts',
    'lib.esnext.decorators.d.ts',
  ],
  types: [],
  skipLibCheck: true,
};

/** Every diagnostic TypeScript reports for the fixture, message chains flattened. */
function diagnosticsFor(call: string): string {
  const text = `${PREAMBLE}\n${call}\n`;
  const host = ts.createCompilerHost(OPTIONS);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (name) => name === FIXTURE || fileExists(name);
  host.readFile = (name) => (name === FIXTURE ? text : readFile(name));
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === FIXTURE
      ? ts.createSourceFile(name, text, languageVersion)
      : getSourceFile(name, languageVersion, ...rest);

  const program = ts.createProgram({
    rootNames: [FIXTURE],
    options: OPTIONS,
    host,
  });
  const source = program.getSourceFile(FIXTURE);
  if (!source) throw new Error('the fixture did not load');
  return ts
    .getPreEmitDiagnostics(program, source)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    .join('\n');
}

describe('provide', { timeout: 60_000 }, () => {
  it('compiles the fixture preamble cleanly', () => {
    expect(diagnosticsFor('')).toBe('');
  });

  it('names the missing property for a wrong dep', () => {
    expect(
      diagnosticsFor('provide(ShipComputer, { deps: [SubspaceLink] });'),
    ).toContain(
      "Property 'output' is missing in type 'SubspaceLink' but required in type 'ReactorCore'",
    );
  });

  it('reports the argument count for a class with parameters and no deps', () => {
    expect(diagnosticsFor('provide(ShipComputer);')).toContain(
      'Expected 2 arguments, but got 1',
    );
  });

  it('names the unknown property for a bad value', () => {
    expect(
      diagnosticsFor('provide(NAV_CHARTS, { useValue: { nope: 1 } });'),
    ).toContain("'nope' does not exist in type 'NavCharts'");
  });

  it('names the missing property for a wrong alias', () => {
    expect(
      diagnosticsFor('provide(COMPUTER, { useExisting: ReactorCore });'),
    ).toContain(
      "Property 'reactor' is missing in type 'ReactorCore' but required in type 'ShipComputer'",
    );
  });

  it('reports NEXUS_ASYNC_TRANSIENT for an async transient factory', () => {
    expect(
      diagnosticsFor(
        "provide(NAV_CHARTS, { useFactory: async () => charts, deps: [], lifetime: 'transient' });",
      ),
    ).toContain(
      'NEXUS_ASYNC_TRANSIENT: get() is synchronous, so a transient factory cannot be async',
    );
  });

  it('reports NEXUS_PROMISE_TOKEN for a token that holds a Promise', () => {
    expect(
      diagnosticsFor(
        "const PROMISED = new Token<Promise<NavCharts>>('Promised');\nprovide(PROMISED, { useFactory: async () => charts, deps: [] });",
      ),
    ).toContain('NEXUS_PROMISE_TOKEN: the container awaits a factory result');
  });
});
