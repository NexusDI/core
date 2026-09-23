export function smokeTargets(mode: string, origin: string): string[];
export function checkResponse(
  url: string,
  status: number,
  body: string,
): string[];
export function runSmoke(
  targets: string[],
  fetchImpl: typeof fetch,
  options: { attempts: number; delayMs: number },
): Promise<string[]>;
