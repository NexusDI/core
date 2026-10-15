// The binding vitest.workers.config.ts adds, so a test knows which config it
// runs under.
declare namespace Cloudflare {
  interface Env {
    readonly SIGNAL: 'on' | 'off';
  }
}
