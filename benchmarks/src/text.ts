/** Tool output as a results file stores it: one line, reproducible. */
import { realpathSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

/**
 * The line of a tool's output that names the error: the first that says
 * "error", else the first non-empty one. Build durations are dropped, so
 * the file reproduces.
 */
export function firstLine(text: string): string {
  const lines = stripVTControlCharacters(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const at = Math.max(
    lines.findIndex((l) => /error/i.test(l)),
    0,
  );
  // "error during build:" and the like put the error on the next line.
  let line = lines[at] ?? '';
  for (let next = at + 1; line.endsWith(':') && next < lines.length; next++)
    line = `${line} ${lines[next]}`;
  return line.replace(/ in \d+(?:\.\d+)?m?s\b/g, '');
}

/**
 * A message with the throwaway directory's paths and every line and column
 * number removed, so the file reproduces byte for byte.
 */
export function stripPaths(message: string, dir: string): string {
  let out = message;
  for (const path of new Set([dir, realpathSync(dir)]))
    out = out.split(path).join('<cell>');
  return out
    .replace(/(\.[cm]?[jt]s):\d+(?::\d+)?/g, '$1')
    .replace(/\((\d+),(\d+)\)/g, '')
    .replace(/[ \t]+$/, '');
}
