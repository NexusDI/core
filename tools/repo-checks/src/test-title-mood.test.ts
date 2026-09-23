import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { workspaceRoot } from '@nx/devkit';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * An `it` title states a behaviour the library has, in the indicative.
 *
 * `refuses a key the document never held` reads as something the library
 * does. `should refuse a key the document never held` reads as a task
 * nobody finished.
 *
 * Two rules, both read off the first word.
 *
 * A title does not open with `should`, `will`, `must` or `can`. A modal puts
 * the sentence in the future or the obligatory, which is the mood of a
 * specification rather than of a record of what ran.
 *
 * A title starts lower-case, unless it opens with two capitals (an acronym
 * used as a verb).
 *
 * The test fails the build on a violation. It covers every project.
 */

/** Where test sources live. */
const ROOTS = ['libs', 'tools', 'examples'];

/** Projects excluded from this rule. None today. */
const EXCLUDED_ROOTS: string[] = [];

/** A file the rules are read from. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** The moods a title may not open in. */
const MODALS = new Set(['should', 'will', 'must', 'can']);

/** Every test source under the workspace, excluding EXCLUDED_ROOTS. */
function testFiles(): string[] {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'node_modules' || entry.name === 'dist') return [];
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return TEST_FILE.test(entry.name) ? [path] : [];
    });
  }

  return ROOTS.flatMap((root) => walk(join(workspaceRoot, root))).filter(
    (path) => {
      const relative = path.slice(workspaceRoot.length + 1);
      return !EXCLUDED_ROOTS.some((excluded) =>
        relative.startsWith(`${excluded}/`),
      );
    },
  );
}

/**
 * The literal title of an `it` or `test` call, where it has one.
 *
 * A template title is read from its head, so `` `seed ${n}` `` is judged on
 * `seed`. A title that opens with an interpolation has no first word to
 * judge and returns null.
 */
function titleOf(node: ts.CallExpression): string | null {
  let callee = node.expression;
  while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
    callee = callee.expression;
  }
  if (!ts.isIdentifier(callee)) return null;
  if (callee.text !== 'it' && callee.text !== 'test') return null;

  const [first] = node.arguments;
  if (!first) return null;
  if (ts.isStringLiteralLike(first)) return first.text;
  if (ts.isTemplateExpression(first)) {
    return first.head.text === '' ? null : first.head.text;
  }
  return null;
}

/** Every `it` title a file carries, with the line it sits on. */
function titlesIn(path: string): { line: number; title: string }[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: { line: number; title: string }[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const title = titleOf(node);
      if (title !== null) {
        found.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source))
            .line,
          title,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return found;
}

/** Why a title breaks a rule, or null when it keeps both. */
function faultOf(title: string): string | null {
  const [word = ''] = title.split(/[^\p{L}\p{N}'-]/u);

  if (MODALS.has(word.toLowerCase())) {
    return `opens in the "${word}" mood -- say what the code does`;
  }
  if (/^\p{Lu}/u.test(title) && !/^\p{Lu}\p{Lu}/u.test(title)) {
    return 'starts upper-case -- a title continues its describe chain';
  }
  return null;
}

describe('a test title', () => {
  it('states a behaviour rather than asking for one', () => {
    const found: string[] = [];

    for (const path of testFiles()) {
      const relative = path.slice(workspaceRoot.length + 1);

      for (const { line, title } of titlesIn(path)) {
        const fault = faultOf(title);
        if (fault === null) continue;
        found.push(`${relative}:${line + 1}: "${title}" -- ${fault}`);
      }
    }

    expect(found.sort()).toEqual([]);
  });
});
