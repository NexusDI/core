/**
 * The bundle entry of spec 4.7's size figure, per library-variant: it
 * imports the tsc build of the Meridian-8 fixture, builds the graph and
 * keeps the bridge on globalThis, so no bundler drops the graph. The
 * adapter goes on globalThis too, so scenario.mjs can run the bundle.
 */
export function sizeEntry(modulePath: string): string {
  return [
    `import { adapter } from './${modulePath}';`,
    '',
    'globalThis.__adapter = adapter;',
    'const ship = await adapter.ready();',
    "globalThis.__meridian = ship.get('bridge');",
    '',
  ].join('\n');
}

/** Re-exports the adapter a bundle left on globalThis, for scenario.mjs. */
export function bundleRunner(bundle: string): string {
  return [
    `import './${bundle}';`,
    '',
    'export const adapter = globalThis.__adapter;',
    '',
  ].join('\n');
}
