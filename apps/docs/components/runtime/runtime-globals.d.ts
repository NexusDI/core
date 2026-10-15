/**
 * The globals an example on the site may use, with the signatures of
 * TypeScript's `lib.dom.d.ts` minus the DOM types they reference. A handler
 * takes `never[]` where `lib.dom.d.ts` writes `any[]`, so any callback is
 * accepted and the file passes the repository's lint.
 *
 * The site compiles examples with no `dom` lib (`compiler-options.ts`), so a
 * fence calling `console.log` fails with TS2584 unless this file declares it.
 * `apps/docs/tsconfig.json` excludes the file: the app itself compiles with
 * the `dom` lib, which declares every name here already.
 */

interface RuntimeConsole {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
  debug(...data: unknown[]): void;
  table(...data: unknown[]): void;
}

declare const console: RuntimeConsole;

declare function setTimeout(
  handler: string | ((...args: never[]) => void),
  timeout?: number,
  ...arguments: unknown[]
): number;
declare function clearTimeout(id: number | undefined): void;
declare function setInterval(
  handler: string | ((...args: never[]) => void),
  timeout?: number,
  ...arguments: unknown[]
): number;
declare function clearInterval(id: number | undefined): void;
declare function queueMicrotask(callback: () => void): void;

declare const performance: { now(): number };
