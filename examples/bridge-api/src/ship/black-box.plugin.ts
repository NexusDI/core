import {
  errorBase,
  NEXUS_PLUGIN_API,
  type ErrorText,
  type ErrorTextPack,
  type NexusPlugin,
  type TraceEvent,
} from '@nexusdi/core';
import {
  isShipSystemClass,
  PHASES,
  SHIP_SYSTEMS,
} from '@nexusdi/meridian-systems';

const DOCS = 'https://github.com/NexusDI/core/tree/main/examples/bridge-api#';

interface SystemPhaseFields {
  /** The class bound to `SHIP_SYSTEMS` that declares no usable static phase. */
  readonly system: string;
}

/**
 * A `SHIP_SYSTEMS` class declares no static `phase` of 1 to 6. The black box
 * owns this code: it stamps each system with the phase it reads from the
 * class, and `SHIP_SYSTEMS` itself leaves the static optional.
 */
export class SystemPhaseError extends errorBase<
  'MERIDIAN_SYSTEM_PHASE',
  SystemPhaseFields
>('MERIDIAN_SYSTEM_PHASE', 'SystemPhaseError', DOCS) {}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    MERIDIAN_SYSTEM_PHASE: SystemPhaseError;
  }
}

/** The text of `MERIDIAN_SYSTEM_PHASE`. bridge-api adds it to `SHIP_TEXT`. */
export const systemPhaseText = {
  MERIDIAN_SYSTEM_PHASE: (error: SystemPhaseError): ErrorText => ({
    message: `${error.system} is bound to SHIP_SYSTEMS and declares no static phase of ${PHASES[0]} to ${PHASES.at(-1)}.`,
    fix: `declare \`static readonly phase\` on the class, one of ${PHASES[0]} to ${PHASES.at(-1)}, so the graph and the black box read it without building the class.`,
  }),
} satisfies ErrorTextPack;

/** What `construct` records for one ship system. */
export interface SystemStamp {
  readonly system: string;
  readonly phase: number;
  /** The scope that built the system, or null at the root. */
  readonly scope: string | null;
}

/**
 * The ship's black box: the recorder plugin and the two records it keeps.
 * Each `blackBox()` call makes a new plugin with its own records, so two
 * containers never share one box.
 */
export interface BlackBox {
  readonly plugin: NexusPlugin;
  /** The last trace events, oldest first. */
  trace(): readonly TraceEvent[];
  /** One stamp per ship system built, in build order. */
  stamps(): readonly SystemStamp[];
}

export interface BlackBoxOptions {
  /**
   * How many trace events the box keeps: a non-negative integer. Defaults to
   * 256.
   */
  capacity?: number;
}

/**
 * Refuses a `SHIP_SYSTEMS` class that declares no static phase, with
 * `MERIDIAN_SYSTEM_PHASE`. It checks class providers only: a factory or a
 * value contribution has no class to read a static from, so the check skips
 * it. It keeps no state, so every container can share this one plugin.
 */
export const phaseCheck: NexusPlugin = {
  name: 'meridian:phase-check',
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    check(view, report) {
      const systems = view.canonical(SHIP_SYSTEMS);
      for (const provider of view.providers)
        if (
          provider.token === systems &&
          provider.kind === 'class' &&
          !isShipSystemClass(provider.implementation)
        )
          report(
            new SystemPhaseError({
              system: provider.implementation?.name ?? provider.name,
            }),
          );
    },
  },
};

/**
 * Builds a black box. `observe` keeps the last `capacity` trace events and
 * `construct` stamps each `SHIP_SYSTEMS` instance with its name, phase and
 * scope. Core traces a container only while some plugin has an observe or a
 * construct hook, so a ship without a black box pays nothing for it. Throws a
 * plain Error when `capacity` is not a non-negative integer.
 */
export function blackBox(options: BlackBoxOptions = {}): BlackBox {
  const capacity = options.capacity ?? 256;
  if (!Number.isInteger(capacity) || capacity < 0)
    throw new Error(
      `blackBox capacity is ${String(capacity)}. Pass a non-negative integer.`,
    );
  const events: TraceEvent[] = [];
  const stamped: SystemStamp[] = [];
  const plugin: NexusPlugin = {
    name: 'meridian:black-box',
    apiVersion: NEXUS_PLUGIN_API,
    observe(event) {
      events.push(event);
      if (events.length > capacity) events.shift();
    },
    construct(instance, provider, scope) {
      // written is the token the module listed, whatever a tokenKey hook did.
      if (provider.written !== SHIP_SYSTEMS) return undefined;
      const { name, phase } = (instance ?? {}) as {
        name?: unknown;
        phase?: unknown;
      };
      if (typeof phase === 'number')
        stamped.push({ system: String(name), phase, scope });
      return undefined;
    },
  };
  return {
    plugin,
    trace: () => [...events],
    stamps: () => [...stamped],
  };
}
