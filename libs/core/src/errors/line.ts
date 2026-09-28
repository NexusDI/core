/** The docs page of each code. */
export const DOCS_URL = 'https://nexus.js.org/errors/';

/**
 * Core's message body: the fields that are strings, numbers or non-empty
 * string arrays, as key=value pairs in field order, then the code's docs
 * link. No text per code, so the bundle carries none.
 */
export function lineOf(code: string, fields: object): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'code') continue;
    if (typeof value === 'string' || typeof value === 'number')
      parts.push(`${key}=${value}`);
    else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === 'string')
    )
      parts.push(`${key}=${value.join(',')}`);
  }
  const head = parts.length === 0 ? '' : `${parts.join(' ')}. `;
  return `${head}${DOCS_URL}${code}`;
}
