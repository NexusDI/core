import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;

/** A doctest fence, as vite-plugin-doctest and the region loader read it. */
const BLOCK =
  /^(`{3,})(?:ts|typescript)\b[^\n]*@import\.meta\.vitest[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm;

/**
 * The options of a reader's project (spec 5.3): strict, ES2022, bundler
 * resolution and the disposable lib, with Node's types for `console`. The
 * source condition resolves each package to the workspace source the
 * doctests run.
 */
const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  customConditions: ['@nexusdi/source'],
  allowImportingTsExtensions: true,
  strict: true,
  lib: ['lib.es2023.d.ts', 'lib.esnext.disposable.d.ts'],
  types: ['node'],
  skipLibCheck: true,
  noEmit: true,
};

function examplesFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return examplesFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

/** Every block of every examples file, each as a module of its own. */
function blocks(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of examplesFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    let at = 0;
    for (const match of text.matchAll(BLOCK)) {
      const line = text.slice(0, match.index).split('\n').length + 1;
      const code = match[2] as string;
      const module = /^\s*(import|export)\b/m.test(code)
        ? code
        : `${code}\nexport {};`;
      out.set(`${file}.block${at}.L${line}.ts`, module);
      at += 1;
    }
  }
  return out;
}

// One TypeScript program over every block takes about 6 s on a CI runner.
describe('the examples files', { timeout: 60_000 }, () => {
  it('type-check, each block as a module of its own', () => {
    const files = blocks();
    const host = ts.createCompilerHost(OPTIONS);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (name, language) => {
      const code = files.get(name);
      return code === undefined
        ? read(name, language)
        : ts.createSourceFile(name, code, language, true);
    };
    const exists = host.fileExists.bind(host);
    host.fileExists = (name) => files.has(name) || exists(name);

    const program = ts.createProgram(
      [...files.keys(), join(SRC, 'request.d.ts')],
      OPTIONS,
      host,
    );
    const diagnostics = ts.getPreEmitDiagnostics(program).flatMap((d) => {
      const file = d.file;
      if (file === undefined || !files.has(file.fileName)) return [];
      const { line } = file.getLineAndCharacterOfPosition(d.start ?? 0);
      const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      return [
        `${relative(SRC, file.fileName)}:${line + 1} TS${d.code} ${text}`,
      ];
    });

    expect(diagnostics).toEqual([]);
  });
});
