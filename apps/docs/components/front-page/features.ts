import { shipSystems } from '../../app/ship-systems';

/**
 * The seven features of site UX spec 6.2 as the ship systems strip shows
 * them, bow to stern (site UX spec 4.8). `hull` is the part of the ship the
 * feature lives in, `module` the module of the seed that part belongs to
 * (`fixtures/modules.json`, from `inspect()`), `fixtures` the geometry fixtures
 * the strip's leader line and crop centre on, and `label` matches the entry
 * of `app/ship-systems.ts` that gives the link: each crop links its concept
 * page until the feature pages exist (tech lead TL9).
 */
export interface Feature {
  label: string;
  hull: string;
  module: string;
  line: string;
  href: string;
  /** The fixtures of the geometry where the feature lives; the strip centres on them. */
  fixtures: readonly string[];
}

const FEATURES = [
  {
    label: 'HTTP adapters',
    fixtures: ['bridge.station-bank'],
    hull: 'Bridge',
    module: 'Meridian',
    line: 'Guard and scope every HTTP request',
  },
  {
    label: 'Devtools',
    fixtures: ['computer-core.rack-port'],
    hull: 'Computer core',
    module: 'Engineering',
    line: 'See the graph and what slows startup',
  },
  {
    label: 'Configurable modules',
    fixtures: ['comms-relay.equipment-rack'],
    hull: 'Comms',
    module: 'Comms',
    line: 'Configure a module and check its options',
  },
  {
    label: 'Scopes',
    fixtures: ['shuttle-bay.shuttle'],
    hull: 'Shuttle bay',
    module: 'BridgeApi',
    line: 'Give every request its own services',
  },
  {
    label: 'Extension points',
    fixtures: ['engineering.power-router'],
    hull: 'Engineering',
    module: 'Engineering',
    line: 'Collect contributions from every module',
  },
  {
    label: 'Lazy edges',
    fixtures: ['engineering.power-router', 'reactor-bay.shadow-shield'],
    hull: 'Engineering',
    module: 'Engineering',
    line: 'Break a dependency cycle with one edge',
  },
  {
    label: 'Testing',
    fixtures: ['reactor-bay.vessel'],
    hull: 'Engineering',
    module: 'Engineering',
    line: 'Swap one service and keep the real graph',
  },
] as const;

export const features: readonly Feature[] = FEATURES.map((feature) => {
  const system = shipSystems.find((each) => each.label === feature.label);
  if (!system) throw new Error(`No ship system is named ${feature.label}.`);
  return { ...feature, href: system.href };
});

/** One module of the seed, as `scene-fixtures.mjs` writes it from `inspect()`. */
export interface SeedModule {
  name: string;
  exports: string[];
}

/** The placard of a feature: the module and what it exports. */
export function placardOf(
  feature: Feature,
  modules: readonly SeedModule[],
): string {
  const found = modules.find((each) => each.name === feature.module);
  if (!found) throw new Error(`The seed has no module ${feature.module}.`);
  const exported =
    found.exports.length === 0
      ? 'exports nothing'
      : `exports ${found.exports.join(' and ')}`;
  return `${found.name} ${exported}.`;
}
