import {
  describeValue,
  displayName,
  errorBase,
  isForeign,
  NEXUS_PLUGIN_API,
  Token,
  type BlueprintView,
  type ErrorTextPack,
  type NexusPlugin,
  type PluginContext,
  type ProviderView,
} from '@nexusdi/core';

// @acme/shields, a third-party package written against plugin API 1 with
// @nexusdi/core as its only import. It uses every contribution point of the
// extension spec's section 2.5.11, and plugin-api-1.test-d.ts holds each one.
// The annotator matches devtools' GraphAnnotator by shape, with no import.

export interface IShieldGrid {
  raise(sector: string): void;
}
export const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');

interface ShieldSectorFields {
  readonly sector: string;
  readonly received: string;
}

/** A shield sector bound to a token another copy of core made. */
export class ShieldSectorError extends errorBase<
  'ACME_SHIELD_SECTOR',
  ShieldSectorFields
>('ACME_SHIELD_SECTOR', 'ShieldSectorError', 'https://acme.dev/errors/') {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    ACME_SHIELD_SECTOR: ShieldSectorError;
  }
  interface TraceEventByType {
    '@acme/shields/raise': { sector: string; token: string };
  }
}

/** Where the shield plugin looked a token up, stored hidden on its error. */
interface SectorLookup {
  readonly token: unknown;
  readonly moduleId: string;
}

function lookupOf(error: ShieldSectorError): SectorLookup | undefined {
  return (error as { sectorLookup?: SectorLookup }).sectorLookup;
}

export const shieldText = {
  ACME_SHIELD_SECTOR: (error, _view, kit) => {
    const lookup = lookupOf(error);
    const nearMisses =
      lookup === undefined ? [] : kit.nearMisses(lookup.token, lookup.moduleId);
    return {
      message: `shield sector ${error.sector} is bound to ${error.received}, made by another copy of @nexusdi/core.`,
      fix: 'install one copy of @nexusdi/core.',
      nearMisses,
    };
  },
} satisfies ErrorTextPack;

/** Notes each provider of SHIELD_GRID with the sector count of the view. */
export function shieldNotes(
  view: BlueprintView,
): readonly { readonly provider: string; readonly label: string }[] {
  const notes: { provider: string; label: string }[] = [];
  for (const provider of view.providers)
    if (provider.token === SHIELD_GRID)
      notes.push({
        provider: provider.id,
        label: `shields ${view.providers.length} sectors`,
      });
  return notes;
}

/** Raises a shield per constructed provider and reports sectors bound to a foreign token. */
export function shields(): NexusPlugin {
  // V15: construct receives the ProviderView objects compile.check saw.
  const sectors = new WeakMap<ProviderView, string>();
  let context: PluginContext | undefined;
  return {
    name: 'acme:shields',
    apiVersion: NEXUS_PLUGIN_API,
    setup: (plugin) => {
      context = plugin;
    },
    compile: {
      check: (view, report) => {
        for (const provider of view.providers) {
          sectors.set(provider, `${provider.module}/${provider.name}`);
          if (isForeign(provider.written))
            report(
              new ShieldSectorError(
                {
                  sector: provider.name,
                  received: describeValue(provider.written),
                },
                {
                  hidden: {
                    sectorLookup: {
                      token: provider.written,
                      moduleId: provider.module,
                    },
                  },
                },
              ),
            );
        }
      },
    },
    construct: (instance, provider) => {
      const sector = sectors.get(provider);
      if (sector === undefined || context === undefined) return undefined;
      const token = displayName(provider.token);
      context.emit(() => ({ type: '@acme/shields/raise', sector, token }));
      if (instance === undefined)
        throw context.format(
          new ShieldSectorError({ sector, received: describeValue(instance) }),
        );
      return undefined;
    },
  };
}
