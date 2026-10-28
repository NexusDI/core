import { type Env, isDev } from './env';

const DEFAULT_SHELL_ORIGINS: readonly string[] = [
  'http://localhost:4300',
  'http://127.0.0.1:4300',
];

/**
 * The browser origins the Hono entry answers with CORS headers: SHELL_ORIGIN,
 * a comma-separated list, or the federation shell's dev server at
 * http://localhost:4300 and http://127.0.0.1:4300. Each entry is trimmed and
 * empty entries are dropped. Production answers none, whatever SHELL_ORIGIN
 * holds.
 */
export function shellOrigins(env: Env = process.env): readonly string[] {
  if (!isDev(env)) return [];
  const origins = (env.SHELL_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_SHELL_ORIGINS;
}
