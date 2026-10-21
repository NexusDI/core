import { describeThrown } from './describe-thrown.js';
import type { SchemaIssue } from './module-options-error.js';

/** The docs page of each code. */
export const DOCS_URL = 'https://nexus.js.org/errors/';

/** A backslash, and every character that ends a line: LF, CR, VT, FF, NEL, LS and PS. */
const ESCAPED = /[\\\n\r\v\f\u0085\u2028\u2029]/g;

/**
 * `value` with each line break written as an escape, so it stays on one
 * line. A backslash is doubled, so a value that holds the two characters
 * `\n` prints apart from one that holds a line break.
 */
function oneLine(value: string): string {
  return value.replace(ESCAPED, (ch) =>
    ch === '\\'
      ? '\\\\'
      : ch === '\n'
        ? '\\n'
        : ch === '\r'
          ? '\\r'
          : `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * Writes an issue, such as a schema issue, as `path: message`, or as the
 * message alone when it has no path. A `{ key }` segment prints its key.
 */
export function issueLine(issue: SchemaIssue): string {
  const keys = (issue.path ?? []).map((segment) =>
    String(
      segment !== null && typeof segment === 'object' ? segment.key : segment,
    ),
  );
  return keys.length === 0
    ? issue.message
    : `${keys.join('.')}: ${issue.message}`;
}

/**
 * True for an item lineOf prints with issueLine: an object, not an Error,
 * with a string message and no path or an array path.
 */
const isIssue = (item: unknown): item is SchemaIssue =>
  typeof item === 'object' &&
  item !== null &&
  !(item instanceof Error) &&
  typeof (item as { message?: unknown }).message === 'string' &&
  ((item as { path?: unknown }).path === undefined ||
    Array.isArray((item as { path?: unknown }).path));

/** How many issues the one-line message prints before `(and N more)`. */
const LINE_ISSUES = 3;

/**
 * Core's message body: the fields that are strings, numbers or non-empty
 * string arrays, as key=value pairs in field order, then the code's docs
 * link under `docs`. A non-empty array of issues (objects with a string
 * message that are not Errors) prints its first three as `path: message`,
 * joined by `; `. A cause in `options` follows the link as `Cause: ` and
 * its text. A line break inside a value is escaped. No text per code, so
 * the bundle carries none.
 */
export function lineOf(
  code: string,
  fields: object,
  docs = DOCS_URL,
  options?: ErrorOptions,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'code') continue;
    if (typeof value === 'string' || typeof value === 'number')
      parts.push(`${key}=${oneLine(String(value))}`);
    else if (Array.isArray(value) && value.length > 0) {
      if (value.every((item) => typeof item === 'string'))
        parts.push(`${key}=${oneLine(value.join(','))}`);
      else if (value.every(isIssue)) {
        const more = value.length - LINE_ISSUES;
        const shown = value.slice(0, LINE_ISSUES).map(issueLine).join('; ');
        parts.push(
          `${key}=${oneLine(more > 0 ? `${shown} (and ${more} more)` : shown)}`,
        );
      }
    }
  }
  const head = parts.length === 0 ? '' : `${parts.join(' ')}. `;
  const cause =
    options !== undefined && 'cause' in options
      ? ` Cause: ${oneLine(describeThrown(options.cause))}`
      : '';
  return `${head}${docs}${code}${cause}`;
}

/** The parts of a formatted message, as a formatError hook returns them. */
interface TextParts {
  readonly message: string;
  readonly hints?: readonly string[];
  readonly fix?: string;
}

/**
 * The message core writes from a formatter's text: `[CODE] `, the message,
 * each hint on its own line indented by two spaces, then the fix line.
 */
export function layoutText(code: string, text: TextParts): string {
  return [
    `[${code}] ${text.message}`,
    ...(text.hints ?? []).map((hint) => `  ${hint}`),
    ...(text.fix === undefined ? [] : [`  Fix: ${text.fix}`]),
  ].join('\n');
}
