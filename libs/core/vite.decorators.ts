import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * Lowers TC39 standard decorators before Vite's Oxc transform reads a file.
 *
 * Oxc lowers only legacy (experimentalDecorators) decorators, and no Node
 * release runs standard decorators natively. A test that applies
 * `@Injectable` therefore reaches the runtime as a syntax error unless
 * something lowers it first. TypeScript's own transpiler does, with the same
 * emit a consumer's `tsc` build produces, so the tests run the decorator code
 * path users run.
 *
 * Only files with a line that starts with `@` are touched.
 */
export function standardDecorators(): Plugin {
  return {
    name: 'nexusdi:standard-decorators',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!file.endsWith('.ts') || !/^\s*@[A-Za-z]/m.test(code)) return null;

      const output = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          inlineSources: true,
        },
      });

      return {
        code: output.outputText.replace(/\/\/# sourceMappingURL=.*$/m, ''),
        map: output.sourceMapText ? JSON.parse(output.sourceMapText) : null,
      };
    },
  };
}
