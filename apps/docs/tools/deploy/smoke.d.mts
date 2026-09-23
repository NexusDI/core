export function smokeTargets(mode: string, origin: string): string[];
export function smokeNotFoundTargets(mode: string, origin: string): string[];
export function checkResponse(
  url: string,
  status: number,
  body: string,
): string[];
export function checkNotFound(url: string, status: number): string[];
export function runSmoke(
  targets: string[],
  fetchImpl: typeof fetch,
  options: { attempts: number; delayMs: number },
  checker?: (url: string, status: number, body: string) => string[],
): Promise<string[]>;
