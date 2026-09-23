/**
 * Rewrites the READMEs' value-claiming comment style into assertions, so the
 * claim is checked without the example having to read like a test.
 *
 *     Luhn.generate('foo'); // -> { phrase: 'foo', checksum: '5', filtered: 0 }
 *
 * becomes
 *
 *     expect(Luhn.generate('foo')).toEqual({ phrase: 'foo', checksum: '5', filtered: 0 });
 *
 * The rewrite is in memory, at transform time. What ships to npm and renders
 * on GitHub is the left-hand form.
 *
 * One line in, one line out. vite-plugin-doctest's markdown transform maps
 * code blocks back to the file by line number, so a rewrite that added or
 * removed a line would misplace every test after it.
 *
 * Rust, Python and Elixir all ship this as part of the language's doctest
 * runner. Nothing on npm does: `power-doctest` is the only implementation and
 * it has been unmaintained since 2021, so this is written here rather than
 * taken off the shelf.
 */

/** The comment marker a value claim is written with. */
const MARKER = '->';

/** A line claiming a value that cannot be turned into an assertion. */
export class ExpectCommentError extends Error {
  // Explicit fields rather than constructor parameter properties: Nx loads a
  // vite.config.ts importing this module under Node's strip-only TypeScript
  // mode, which rejects any syntax that has to emit code.
  readonly file: string;
  readonly line: number;
  readonly source: string;

  constructor(file: string, line: number, source: string, reason: string) {
    super(`${file}:${line}: ${reason}\n    ${source.trim()}`);
    this.name = 'ExpectCommentError';
    this.file = file;
    this.line = line;
    this.source = source;
  }
}

/**
 * Index of the `//` that starts a line comment, or -1.
 *
 * A scan rather than a regex because `//` inside a string is not a comment,
 * and a documented value is frequently a string containing a URN or a path.
 * Template literals count as strings; a `${...}` inside one cannot open a
 * comment either, so the scan does not need to track expression nesting.
 */
function indexOfLineComment(line: string): number {
  let quote: string | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] as string;

    if (quote !== null) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '/' && line[i + 1] === '/') return i;
  }

  return -1;
}

/**
 * Whether `source` is a complete JavaScript expression.
 *
 * `new Function` parses without evaluating, which is the cheapest parser that
 * agrees with the one the code will actually run under. The parentheses make
 * an object literal parse as a value rather than as a block.
 */
function isExpression(source: string): boolean {
  try {
    new Function(`return (\n${source}\n);`);
    return true;
  } catch {
    return false;
  }
}

/** The two halves of a `EXPR; // -> VALUE` line, as written. */
export interface ValueClaim {
  /** Whitespace before the expression, so a rewrite can put it back. */
  indent: string;
  /** The expression, without its trailing semicolon. */
  statement: string;
  /** The claimed value, as source text. */
  expected: string;
}

/**
 * Splits a line into its expression and its claimed value, or returns null for
 * a line that claims nothing.
 *
 * Nothing here is validated: `rewriteLine` decides which of these pairs can
 * become an assertion, and a reader of a claim that is already running as a
 * test wants the pair rather than that judgement. Exported because the docs
 * app's probes seed themselves from the same claims — a second scanner would
 * be a second answer to "is this line a claim", on the lines the first one
 * already owns.
 */
export function readValueClaim(line: string): ValueClaim | null {
  const commentAt = indexOfLineComment(line);
  if (commentAt === -1) return null;

  const comment = line.slice(commentAt + 2).trim();
  if (!comment.startsWith(MARKER)) return null;

  const code = line.slice(0, commentAt).trimEnd();

  return {
    indent: code.slice(0, code.length - code.trimStart().length),
    statement: code.trim().replace(/;$/, ''),
    expected: comment.slice(MARKER.length).trim(),
  };
}

/**
 * Rewrites one line, or returns it unchanged when it carries no value claim.
 *
 * @throws {ExpectCommentError} when a line claims a value that cannot be
 * checked. Skipping silently would leave an example that looks checked and is
 * not, which is worse than one that visibly is not.
 */
export function rewriteLine(
  line: string,
  file: string,
  number: number,
): string {
  const asImport = rewriteImport(line);
  if (asImport !== null) return asImport;

  const claim = readValueClaim(line);
  if (claim === null) return line;

  const { indent, statement, expected } = claim;

  if (statement === '') {
    throw new ExpectCommentError(
      file,
      number,
      line,
      'a value claim with no expression before it',
    );
  }

  // A claim on a declaration is about the value bound, so the assertion goes
  // after it and reads the binding. Two statements, still one line.
  const declaration = statement.match(
    /^((?:const|let|var)\s+(\w+)\s*=\s*.+)$/s,
  );
  if (declaration && isExpression(declaration[2] as string)) {
    if (!isExpression(expected)) {
      throw new ExpectCommentError(
        file,
        number,
        line,
        'the claimed value does not parse as an expression — write prose as a ' +
          'plain comment, without the -> marker',
      );
    }
    return `${indent}${declaration[1]}; expect(${declaration[2]}).toEqual(${expected});`;
  }

  if (!isExpression(statement)) {
    throw new ExpectCommentError(
      file,
      number,
      line,
      'the code before the claim is not a single expression or a plain ' +
        'declaration. A statement spanning several lines, or one binding a ' +
        'destructuring pattern, has no one value to claim — name the value on ' +
        'its own line, or assert it in a spec file',
    );
  }

  if (!isExpression(expected)) {
    throw new ExpectCommentError(
      file,
      number,
      line,
      'the claimed value does not parse as an expression — write prose as a ' +
        'plain comment, without the -> marker',
    );
  }

  // toEqual, not toBe: a documented value is written as a literal, and every
  // object and array literal in a doc is a fresh object that toBe rejects.
  // toEqual still compares primitives by value, so the looser matcher costs
  // nothing on the cases toBe would have covered.
  return `${indent}expect(${statement}).toEqual(${expected});`;
}

/**
 * `{ a, b as c, type T }` as a destructuring pattern.
 *
 * An inline `type` specifier names nothing at runtime, so it is dropped rather
 * than destructured off a namespace object that does not carry it.
 */
function namedBindings(clause: string): string {
  return clause
    .slice(1, -1)
    .split(',')
    .map((binding) => binding.trim())
    .filter((binding) => binding !== '' && !/^type\s/.test(binding))
    .map((binding) => binding.replace(/\s+as\s+/, ': '))
    .join(', ');
}

/**
 * Rewrites a static import into the dynamic form, or returns null for a line
 * that is not an import.
 *
 * doctest runs a code block as a function body, where a static import is a
 * syntax error. The alternative is to move the imports into a per-package
 * preamble, which costs the README the line a reader most needs — which package
 * the names come from. The specifier is untouched, so the block resolves
 * `@nexusdi/core` the way a consumer does, through the package's exports map.
 *
 * One line in, one line out, same as the value claims.
 */
function rewriteImport(line: string): string | null {
  const indent = line.slice(0, line.length - line.trimStart().length);
  // Collapsed once, up front, so every pattern below matches a literal
  // single space instead of \s+/\s*. Two of those quantifiers back to back
  // -- the leading \s+ after `import` and the \s* guarding `from`, with only
  // zero-width optional groups between them -- let the regex engine
  // redistribute one run of spaces between them in O(n) ways on a line that
  // never reaches `from`, which is quadratic on a long run of spaces. A
  // prettier-formatted import never carries a run of spaces here anyway, so
  // normalizing costs nothing real.
  const source = line.trim().replace(/ {2,}/g, ' ');

  if (!/^import\b/.test(source)) return null;

  // A type-only import has no runtime meaning, and the block it sits in is
  // type-checked by tsc through the file the region came from, not here.
  if (/^import type\b/.test(source)) return `${indent}// ${source}`;

  const bare = source.match(/^import (['"][^'"]+['"]);?$/);
  if (bare) return `${indent}await import(${bare[1]});`;

  const namespace = source.match(
    /^import \* as (\w+) from (['"][^'"]+['"]);?$/,
  );
  if (namespace) {
    return `${indent}const ${namespace[1]} = await import(${namespace[2]});`;
  }

  const named = source.match(
    /^import (?:(\w+), )?(?:(\{[^}]*\}) )?from (['"][^'"]+['"]);?$/,
  );
  if (named) {
    const [, defaultImport, bindings, specifier] = named;
    // `import x from 'm'` binds the module's default export, which destructures
    // off the namespace object as `default`.
    const parts = [
      ...(defaultImport ? [`default: ${defaultImport}`] : []),
      ...(bindings ? [namedBindings(bindings)] : []),
    ].filter((part) => part !== '');

    return `${indent}const { ${parts.join(', ')} } = await import(${specifier});`;
  }

  const onlyDefault = source.match(/^import (\w+) from (['"][^'"]+['"]);?$/);
  if (onlyDefault) {
    return `${indent}const { default: ${onlyDefault[1]} } = await import(${onlyDefault[2]});`;
  }

  return null;
}

/** Whether a fence info string marks the block as a doctest. */
const isDoctestFence = (info: string): boolean =>
  info.includes('@import.meta.vitest');

/**
 * Rewrites value claims inside fenced code blocks that vite-plugin-doctest
 * will run, and leaves every other line alone.
 *
 * Scoped to marked fences because an unmarked block is illustrative — it may
 * not even be JavaScript — and because in a source file the same marker
 * appears in ordinary comments that must never become assertions.
 */
export function rewriteMarkdown(code: string, file: string): string {
  const lines = code.split('\n');
  let fence: string | null = null;
  let running = false;

  return lines
    .map((line, index) => {
      const opening = line.match(/^\s*(`{3,}|~{3,})(.*)$/);

      if (opening && fence === null) {
        fence = opening[1] as string;
        running = isDoctestFence(opening[2] as string);
        return line;
      }

      if (
        opening &&
        fence !== null &&
        (opening[1] as string).startsWith(fence)
      ) {
        fence = null;
        running = false;
        return line;
      }

      return running ? rewriteLine(line, file, index + 1) : line;
    })
    .join('\n');
}

/**
 * The same rewrite inside JSDoc `@example` blocks.
 *
 * Doc comment lines carry a ` * ` gutter that is not part of the example, so
 * it is stripped before the line is read and restored after. Only block
 * comments are entered: a marked fence cannot be opened in `//` comments, and
 * a source file's ordinary trailing comments must stay comments.
 */
export function rewriteJsDoc(code: string, file: string): string {
  const lines = code.split('\n');
  let inComment = false;
  let running = false;

  return lines
    .map((line, index) => {
      if (!inComment) {
        if (/^\s*\/\*/.test(line)) inComment = !/\*\//.test(line);
        return line;
      }

      const gutter = line.match(/^(\s*\*\s?)?(.*)$/) as RegExpMatchArray;
      const prefix = gutter[1] ?? '';
      const content = gutter[2] as string;

      const fence = content.match(/^\s*(`{3,})(.*)$/);
      if (fence) {
        running = running ? false : isDoctestFence(fence[2] as string);
        if (/\*\//.test(line)) inComment = false;
        return line;
      }

      if (/\*\//.test(line)) {
        inComment = false;
        running = false;
        return line;
      }

      return running ? prefix + rewriteLine(content, file, index + 1) : line;
    })
    .join('\n');
}
