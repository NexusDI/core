/** The docs page of each code. */
export const DOCS_URL = 'https://nexus.js.org/errors/';

/** Every character that ends a line: LF, CR, VT, FF, NEL, LS and PS. */
const LINE_BREAK = /[\n\r\v\f\u0085\u2028\u2029]/g;

/** `value` with each line break written as an escape, so it stays on one line. */
function oneLine(value: string): string {
  return value.replace(LINE_BREAK, (ch) =>
    ch === '\n'
      ? '\\n'
      : ch === '\r'
        ? '\\r'
        : `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * Core's message body: the fields that are strings, numbers or non-empty
 * string arrays, as key=value pairs in field order, then the code's docs
 * link. A line break inside a value is escaped. No text per code, so the
 * bundle carries none.
 */
export function lineOf(code: string, fields: object): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'code') continue;
    if (typeof value === 'string' || typeof value === 'number')
      parts.push(`${key}=${oneLine(String(value))}`);
    else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === 'string')
    )
      parts.push(`${key}=${oneLine(value.join(','))}`);
  }
  const head = parts.length === 0 ? '' : `${parts.join(' ')}. `;
  return `${head}${DOCS_URL}${code}`;
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
