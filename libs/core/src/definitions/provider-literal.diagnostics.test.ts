import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '__provider_literal_fixture__.ts');

const PREAMBLE = `
import { defineModule } from './define-module.js';
import { Token } from './token.js';

class ReactorCore { output = 1.21; }
class ShipComputer { constructor(readonly reactor: ReactorCore) {} }
interface NavCharts { plot(to: string): string }
class SubspaceLink { download(path: string): Promise<NavCharts> { return Promise.resolve({ plot: () => path }); } }
class ChartReader {
  static deps = [ReactorCore] as const;
  constructor(readonly charts: NavCharts) {}
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const charts: NavCharts = { plot: (to) => to };
void [ReactorCore, ShipComputer, SubspaceLink, ChartReader, NAV_CHARTS, COMPUTER, charts];
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

interface Located {
  /** The source text the diagnostic covers. */
  readonly at: string;
  readonly message: string;
}

/** Every diagnostic for one `providers` array, with the text it points at. */
function diagnosticsFor(entries: string): Located[] {
  const text = `${PREAMBLE}\ndefineModule({ name: 'Fixture', providers: [\n${entries}\n] });\n`;
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
  return ts.getPreEmitDiagnostics(program, source).map((d) => ({
    at:
      d.start === undefined
        ? ''
        : text.slice(d.start, d.start + (d.length ?? 0)),
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  }));
}

describe('defineModule', { timeout: 60_000 }, () => {
  it('compiles valid literals cleanly', () => {
    expect(
      diagnosticsFor(
        `ReactorCore, { token: ShipComputer, deps: [ReactorCore] }, { token: NAV_CHARTS, useValue: charts }`,
      ),
    ).toEqual([]);
  });

  it('names the missing property for a wrong dep, on the dep', () => {
    const [first] = diagnosticsFor(
      `ReactorCore, { token: ShipComputer, deps: [SubspaceLink] }`,
    );
    expect(first?.at).toBe('SubspaceLink');
    expect(first?.message).toContain(
      "Property 'output' is missing in type 'SubspaceLink' but required in type 'ReactorCore'",
    );
  });

  it('names the missing deps key for a class with parameters, on the element', () => {
    const [first] = diagnosticsFor(`ReactorCore, { token: ShipComputer }`);
    expect(first?.at).toBe('{ token: ShipComputer }');
    expect(first?.message).toContain(
      "Property 'deps' is missing in type '{ token: typeof ShipComputer; }'",
    );
  });

  it('names the unknown property for a bad value, on that property', () => {
    const [first] = diagnosticsFor(
      `{ token: NAV_CHARTS, useValue: { nope: 1 } }`,
    );
    expect(first?.at).toBe('nope');
    expect(first?.message).toContain(
      "'nope' does not exist in type 'NavCharts'",
    );
  });

  it('names the missing property for a wrong alias, on useExisting', () => {
    const [first] = diagnosticsFor(
      `{ token: COMPUTER, useExisting: ReactorCore }`,
    );
    expect(first?.at).toBe('useExisting');
    expect(first?.message).toContain(
      "Property 'reactor' is missing in type 'ReactorCore' but required in type 'ShipComputer'",
    );
  });

  it('reports NEXUS_ASYNC_TRANSIENT on the lifetime', () => {
    const [first] = diagnosticsFor(
      `{ token: NAV_CHARTS, useFactory: async () => charts, deps: [], lifetime: 'transient' }`,
    );
    expect(first?.at).toBe('lifetime');
    expect(first?.message).toContain(
      'NEXUS_ASYNC_TRANSIENT: get() is synchronous, so a transient factory cannot be async',
    );
  });

  it('reports NEXUS_PROMISE_TOKEN on the token', () => {
    const [first] = diagnosticsFor(
      `{ token: new Token<Promise<NavCharts>>('Promised'), useFactory: async () => charts, deps: [] }`,
    );
    expect(first?.at).toBe('token');
    expect(first?.message).toContain(
      'NEXUS_PROMISE_TOKEN: the container awaits a factory result',
    );
  });

  it('reports a lifetime on useValue on the lifetime', () => {
    const [first] = diagnosticsFor(
      `{ token: NAV_CHARTS, useValue: charts, lifetime: 'scoped' }`,
    );
    expect(first?.at).toBe('lifetime');
    expect(first?.message).toContain(
      'NEXUS_INVALID_PROVIDER: useValue and useExisting take no lifetime',
    );
  });

  it('accepts a factory without deps and rejects a parameter no deps entry supplies', () => {
    expect(
      diagnosticsFor(`{ token: NAV_CHARTS, useFactory: () => charts }`),
    ).toEqual([]);
    const [first] = diagnosticsFor(
      `{ token: COMPUTER, useFactory: (core: ReactorCore) => new ShipComputer(core) }`,
    );
    expect(first?.at).toBe('useFactory');
    expect(first?.message).toContain(
      'Target signature provides too few arguments. Expected 1 or more, but got 0',
    );
  });

  it('asks for annotations on an unannotated factory, on useFactory', () => {
    const found = diagnosticsFor(
      `{ token: NAV_CHARTS, useFactory: (link) => link.download('charts'), deps: [SubspaceLink] }`,
    );
    expect(found.map((d) => d.at)).toEqual(['useFactory', 'link']);
    expect(found[0]?.message).toContain(
      'A provider literal cannot type a function from its deps. Annotate the parameters, or use provide()',
    );
  });

  it('names an unknown key on that key', () => {
    const [first] = diagnosticsFor(
      `{ token: NAV_CHARTS, useValue: charts, scope: 'request' }`,
    );
    expect(first?.at).toBe('scope');
    expect(first?.message).toContain(
      "Object literal may only specify known properties, and 'scope' does not exist",
    );
  });

  it('names the mismatch for a static deps that does not fit, on the class', () => {
    const [first] = diagnosticsFor(`ChartReader`);
    expect(first?.at).toBe('ChartReader');
    expect(first?.message).toContain(
      "Types of property 'deps' are incompatible",
    );
    expect(first?.message).toContain(
      "Property 'plot' is missing in type 'ReactorCore' but required in type 'NavCharts'",
    );
  });
});
