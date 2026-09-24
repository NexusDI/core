import ts from 'typescript';
import type { Plugin } from 'vite';

import { readValueClaim } from '@nexusdi/doc-examples/claims';

const DECORATOR_LINE = /^\s*@[A-Za-z]/m;

/** A doctest fence in markdown, as vite-plugin-doctest reads it. */
const DOCTEST_BLOCK =
  /^(`{3,})((?:ts|typescript)\b[^\n]*@import\.meta\.vitest[^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
};

/**
 * Drops the `export {};` TypeScript appends to a module with no import or
 * export. A doctest block runs as a function body, where it is a syntax
 * error.
 */
const dropEmptyExport: ts.TransformerFactory<ts.SourceFile> = () => (file) =>
  ts.factory.updateSourceFile(
    file,
    file.statements.filter(
      (statement) =>
        !(
          ts.isExportDeclaration(statement) &&
          !statement.moduleSpecifier &&
          statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.length === 0
        ),
    ),
  );

function lower(
  code: string,
  fileName: string,
): { code: string; map: string | undefined } {
  const output = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      ...COMPILER_OPTIONS,
      sourceMap: true,
      inlineSources: true,
    },
  });
  return {
    code: output.outputText.replace(/\/\/# sourceMappingURL=.*$/m, ''),
    map: output.sourceMapText,
  };
}

function hasDecorator(node: ts.Node): boolean {
  return ts.isDecorator(node) || (ts.forEachChild(node, hasDecorator) ?? false);
}

/** A literal whose source text can hold a line break. */
function isTextLiteral(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

/**
 * Start and end offsets of every literal whose text may hold a newline.
 *
 * @throws when `code` holds a line comment, which a joined line would extend
 * over the code after it.
 */
function literalRanges(code: string, where: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    const comments = [
      ...(ts.getLeadingCommentRanges(code, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(code, node.end) ?? []),
    ];
    if (
      comments.some((c) => c.kind === ts.SyntaxKind.SingleLineCommentTrivia)
    ) {
      throw new Error(`${where} lowers to code with a line comment.`);
    }
    if (isTextLiteral(node)) {
      ranges.push([node.getStart(), node.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('lowered.js', code, ts.ScriptTarget.ES2022, true));
  return ranges;
}

/**
 * Puts `code` on `lines` lines: every line break outside a literal becomes a
 * space, and blank lines pad the rest.
 *
 * TypeScript's output has no comments here and ends every statement with a
 * semicolon, so a line break outside a literal carries no meaning. A break
 * inside a template literal is part of its value and stays.
 */
function fitToLines(code: string, lines: number, where: string): string {
  const ranges = literalRanges(code, where);
  let fitted = '';
  let breaks = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i] as string;
    if (char !== '\n') {
      fitted += char;
      continue;
    }
    if (ranges.some(([start, end]) => i > start && i < end)) {
      fitted += char;
      breaks++;
      continue;
    }
    fitted = fitted.trimEnd() + ' ';
    while (code[i + 1] === ' ') i++;
  }
  if (breaks > lines - 1) {
    throw new Error(
      `${where} lowers to more lines than it spans in the README.`,
    );
  }
  return fitted.trim() + '\n'.repeat(lines - 1 - breaks);
}

function lineOf(code: string, offset: number): number {
  return code.slice(0, offset).split('\n').length;
}

/**
 * Lowers each decorated top-level statement of a doctest block, keeping every
 * line of the block at its line number.
 *
 * vite-plugin-doctest finds each block by the line it starts on, and the
 * claim rewriter reports a claim by its line, so the lowered block must have
 * the README's line count. Every statement without a decorator stays as the
 * README wrote it, imports and `// ->` claims included.
 */
function lowerBlock(body: string, where: string): string {
  const source = ts.createSourceFile(
    'block.ts',
    body,
    ts.ScriptTarget.ES2022,
    true,
  );
  let lowered = '';
  let cursor = 0;
  for (const statement of source.statements) {
    if (!hasDecorator(statement)) continue;
    const start = statement.getStart();
    const end = statement.getEnd();
    const text = body.slice(start, end);
    const statementAt = `${where}: the decorated statement on line ${lineOf(body, start)} of the block`;

    if (text.split('\n').some((row) => readValueClaim(row) !== null)) {
      throw new Error(
        `${statementAt} carries a \`// ->\` claim. Put the claim on a line ` +
          'of its own after the statement.',
      );
    }

    const output = ts.transpileModule(text, {
      compilerOptions: {
        ...COMPILER_OPTIONS,
        removeComments: true,
        // A lone statement has no import, so TypeScript would read it as a
        // script and emit a "use strict" prologue. A README block is module
        // code.
        moduleDetection: ts.ModuleDetectionKind.Force,
      },
      transformers: { after: [dropEmptyExport] },
    }).outputText;
    lowered +=
      body.slice(cursor, start) +
      fitToLines(output, text.split('\n').length, statementAt);
    cursor = end;
  }
  return lowered + body.slice(cursor);
}

/**
 * Lowers TC39 standard decorators before Vite's Oxc transform reads them.
 *
 * Oxc lowers decorators only under experimentalDecorators and rejects the
 * standard syntax, and no Node release runs standard decorators unlowered.
 * TypeScript's own transpiler lowers them with the emit a consumer's `tsc`
 * build produces, so the tests run the decorator code path users run.
 *
 * Two inputs: a `.ts` file with a line that starts with `@`, and each
 * doctest block of a `.md` file that applies a decorator. The README's
 * blocks reach vite-plugin-doctest, which compiles them with Oxc, only after
 * this plugin, because it is `enforce: 'pre'` and first in `plugins`.
 */
export function standardDecorators(): Plugin {
  return {
    name: 'nexusdi:standard-decorators',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? id;

      if (file.endsWith('.md')) {
        const lowered = code.replace(
          DOCTEST_BLOCK,
          (block, fence: string, info: string, body: string, at: number) => {
            if (!DECORATOR_LINE.test(body)) return block;
            const where = `${file}:${lineOf(code, at)}`;
            return `${fence}${info}\n${lowerBlock(body, where)}\n${fence}`;
          },
        );
        // Every line keeps its number, so positions need no source map.
        return lowered === code ? null : { code: lowered, map: null };
      }

      if (!file.endsWith('.ts') || !DECORATOR_LINE.test(code)) return null;
      const output = lower(code, file);
      return {
        code: output.code,
        map: output.map ? JSON.parse(output.map) : null,
      };
    },
  };
}
