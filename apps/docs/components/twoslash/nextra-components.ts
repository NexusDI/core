/**
 * `nextra/components`, with a lazy `Popup` in place of Nextra's.
 *
 * `next.config.ts` aliases `nextra/components` here through
 * `turbopack.resolveAlias`. Nextra's `rehype-twoslash-popup` imports `Popup`
 * from `nextra/components` into every page with a `twoslash` fence, and
 * Nextra's `Popup` brings headlessui's `Popover` and floating-ui. Nextra 4
 * serves every MDX page from one catch-all route, so those 70 kB raw shipped
 * with every page, a guide included.
 *
 * `nextra/components/index` resolves through Nextra's `./*` export to
 * `dist/client/components/index.js`, a specifier the alias does not match, so
 * this file never imports itself. The explicit `Popup` export wins over the
 * star export's. `nextra-components.test.ts` holds the names to the barrel's.
 */
export * from 'nextra/components/index';
export { Popup } from './LazyPopup';
