import ts from 'typescript';

import { parseFile } from './core-layers.js';

/**
 * The feature-contract suite (plan section 7). `examples/feature-contracts.json`
 * lists each feature the demos use with the contract case that pins it. A case
 * lives in a `*.contract.test.ts` or `*.contract.test.tsx` file under
 * `examples/`. The check fails on a row whose case is missing and on a case in
 * a contract file that no row lists.
 */

/** A contract file: `.contract.test.` before a `.ts` or `.tsx` extension. */
export const CONTRACT_FILE = /\.contract\.test\.tsx?$/;

/** One manifest row: a feature, the contract file that holds its case, and the case's name. */
export interface ContractRow {
  readonly feature: string;
  /** Relative to `examples/`, forward-slashed. */
  readonly file: string;
  readonly test: string;
}

/** One case found in a contract file. */
export interface ContractCase {
  readonly file: string;
  readonly name: string;
}

/** The files of `paths`, relative to `examples/`, that are contract files outside node_modules. */
export function contractFiles(paths: readonly string[]): string[] {
  return paths.filter(
    (path) =>
      CONTRACT_FILE.test(path) && !path.split('/').includes('node_modules'),
  );
}

/** The cases of one contract file, and what stops the file from being read. */
export interface ScannedCases {
  /** Names of the cases that run, in source order. */
  readonly names: string[];
  /** Names of `skip`, `skipIf` and `todo` cases: they list in the file but satisfy no row. */
  readonly skipped: string[];
  /** One line per case without a literal name and per name used twice. */
  readonly problems: string[];
}

const SKIP_MODIFIERS = new Set(['skip', 'skipIf', 'todo']);

/**
 * The identifier at the root of a callee and the member names on the way, so
 * `it.skip`, `it.each(table)` and `` it.each`table` `` all root at `it`.
 */
function calleeChain(expr: ts.Expression): { root: string; members: string[] } {
  const members: string[] = [];
  let node = expr;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) {
      members.unshift(node.name.text);
      node = node.expression;
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      members.unshift(node.argumentExpression.text);
      node = node.expression;
    } else if (ts.isCallExpression(node)) node = node.expression;
    else if (ts.isTaggedTemplateExpression(node)) node = node.tag;
    else if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))
      node = node.expression;
    else break;
  }
  return { root: ts.isIdentifier(node) ? node.text : '', members };
}

/**
 * Every `it` and `test` call in `source`, in source order, with its modifiers
 * (`only`, `skip`, `concurrent`, `each(table)(...)`, `for(table)(...)`). The
 * call that binds a table (`it.each(table)`) is no case; the call it returns is.
 * A case must carry a string literal or a template without substitutions as
 * its name, so the manifest can list it; any other name is a problem.
 */
export function scanCases(path: string, source: string): ScannedCases {
  const names: string[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const file = parseFile({ path, source });
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const { root, members } = calleeChain(node.expression);
      const binder =
        ts.isPropertyAccessExpression(node.expression) &&
        ['each', 'for'].includes(node.expression.name.text);
      if ((root === 'it' || root === 'test') && !binder) {
        const [name] = node.arguments;
        const line =
          file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        if (
          name !== undefined &&
          (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
        ) {
          if (seen.has(name.text))
            problems.push(
              `line ${line}: the case name "${name.text}" is used twice`,
            );
          seen.add(name.text);
          (members.some((m) => SKIP_MODIFIERS.has(m)) ? skipped : names).push(
            name.text,
          );
        } else
          problems.push(
            `line ${line}: a ${root} case needs a string literal as its name`,
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { names, skipped, problems };
}

/** The names of the cases that run in `source`; see `scanCases`. */
export function caseNames(path: string, source: string): string[] {
  return scanCases(path, source).names;
}

/** What the manifest and the contract files disagree on. */
export interface ContractGaps {
  /** Rows whose file holds no case of that name. */
  readonly withoutCase: ContractRow[];
  /** Cases in a contract file that no row lists. */
  readonly withoutRow: ContractCase[];
}

export function contractGaps(
  rows: readonly ContractRow[],
  cases: readonly (ContractCase & { readonly skipped?: boolean })[],
): ContractGaps {
  const key = (file: string, name: string) => `${file}\n${name}`;
  const listed = new Set(rows.map(({ file, test }) => key(file, test)));
  const found = new Set(
    cases
      .filter(({ skipped }) => skipped !== true)
      .map(({ file, name }) => key(file, name)),
  );
  return {
    withoutCase: rows.filter(({ file, test }) => !found.has(key(file, test))),
    withoutRow: cases.filter(({ file, name }) => !listed.has(key(file, name))),
  };
}
