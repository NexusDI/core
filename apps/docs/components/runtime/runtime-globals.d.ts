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

/*
 * The Fetch API's `Request`, `Response` and `Headers`, and `URL`, which Node
 * 22 and later, Workers, Deno and Bun all provide. A web adapter's signatures
 * name them (`@nexusdi/hono`'s handler returns a `Response`), and so do its
 * examples. The bodies leave out the `Blob`, `FormData` and `ReadableStream`
 * forms, which are DOM or stream types, and `json()` resolves to `unknown`.
 * Each is a class, which declares the type and the value under one name.
 */

type HeadersInit = [string, string][] | Record<string, string> | Headers;

declare class Headers {
  constructor(init?: HeadersInit);
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getSetCookie(): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(
    callbackfn: (value: string, key: string, parent: Headers) => void,
  ): void;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

type BodyInit = ArrayBuffer | ArrayBufferView | URLSearchParams | string;

interface Body {
  readonly bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface RequestInit {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
}

declare class Request implements Body {
  constructor(input: Request | URL | string, init?: RequestInit);
  readonly bodyUsed: boolean;
  readonly headers: Headers;
  readonly method: string;
  readonly url: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  clone(): Request;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface ResponseInit {
  headers?: HeadersInit;
  status?: number;
  statusText?: string;
}

declare class Response implements Body {
  constructor(body?: BodyInit | null, init?: ResponseInit);
  static error(): Response;
  static json(data: unknown, init?: ResponseInit): Response;
  static redirect(url: string | URL, status?: number): Response;
  readonly bodyUsed: boolean;
  readonly headers: Headers;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  clone(): Response;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare class URLSearchParams {
  constructor(
    init?: string[][] | Record<string, string> | string | URLSearchParams,
  );
  readonly size: number;
  append(name: string, value: string): void;
  delete(name: string, value?: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string, value?: string): boolean;
  set(name: string, value: string): void;
  sort(): void;
  toString(): string;
  forEach(
    callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
  ): void;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

declare class URL {
  constructor(url: string | URL, base?: string | URL);
  static canParse(url: string | URL, base?: string | URL): boolean;
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  username: string;
  toJSON(): string;
  toString(): string;
}
