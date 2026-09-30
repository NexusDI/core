import { describe, expectTypeOf, it } from 'vitest';

import {
  describeValue,
  displayName,
  errorBase,
  isForeign,
  type NEXUS_PLUGIN_API,
  type BlueprintView,
  type CompilePluginHooks,
  type ErrorFields,
  type ErrorText,
  type ErrorTextKit,
  type ErrorTextPack,
  type NearMiss,
  type NexusPlugin,
  type PluginContext,
  type ProviderView,
  type TraceEvent,
  type TraceEventByType,
} from '@nexusdi/core';
import {
  errors,
  explain,
  type ErrorsOptions,
  type ExplainOptions,
} from '@nexusdi/errors';

import {
  ShieldSectorError,
  shieldNotes,
  shields,
  shieldText,
} from '../test-support/acme-plugin.js';
import {
  devtools,
  inspect,
  type DevtoolsOptions,
  type GraphAnnotator,
  type GraphNote,
  type InspectOptions,
} from './index.js';

// Plugin API 1 (extension spec sections 1.4 and 2.5.11). acme-plugin.ts is a
// third-party plugin that uses every contribution point, so removing a point
// fails its compile. The assertions below pin each point's signature, so a
// change that would break a plugin written for version 1 fails here too.
// This file compiles on every commit until NEXUS_PLUGIN_API changes.

type Entry = NonNullable<ErrorTextPack['ACME_SHIELD_SECTOR']>;
type Namespaced = Extract<keyof TraceEventByType, `${string}/${string}`>;

describe('NEXUS_PLUGIN_API', () => {
  it('is the literal 1', () => {
    expectTypeOf<typeof NEXUS_PLUGIN_API>().toEqualTypeOf<1>();
  });
});

describe('ErrorTextPack', () => {
  it("accepts the third party's pack for its augmented code", () => {
    expectTypeOf(shieldText).toExtend<ErrorTextPack>();
  });

  it('passes an entry the error, the view or undefined, and the kit', () => {
    expectTypeOf<Entry>().toEqualTypeOf<
      (
        error: ShieldSectorError,
        view: BlueprintView | undefined,
        kit: ErrorTextKit,
      ) => ErrorText | undefined
    >();
  });

  it('is accepted by errors(), explain(), devtools() and inspect()', () => {
    expectTypeOf<ErrorsOptions['text']>().toEqualTypeOf<
      readonly ErrorTextPack[] | undefined
    >();
    expectTypeOf<ExplainOptions['text']>().toEqualTypeOf<
      readonly ErrorTextPack[] | undefined
    >();
    expectTypeOf<DevtoolsOptions['text']>().toEqualTypeOf<
      readonly ErrorTextPack[] | undefined
    >();
    expectTypeOf<InspectOptions['text']>().toEqualTypeOf<
      readonly ErrorTextPack[] | undefined
    >();
    const error = new ShieldSectorError({ sector: 'aft', received: 'a Token' });
    expectTypeOf(errors({ text: [shieldText] })).toEqualTypeOf<NexusPlugin>();
    expectTypeOf(explain(error, { text: [shieldText] })).toEqualTypeOf<
      ErrorText | undefined
    >();
    expectTypeOf(devtools({ text: [shieldText] })).toEqualTypeOf<NexusPlugin>();
    inspect([], { text: [shieldText] });
  });
});

describe('ErrorTextKit', () => {
  it('finds near misses for a token and a module id', () => {
    expectTypeOf<ErrorTextKit['nearMisses']>().toEqualTypeOf<
      (token: unknown, moduleId: string) => readonly NearMiss[]
    >();
  });
});

describe('PluginContext', () => {
  it('formats an error and returns it with its type', () => {
    expectTypeOf<PluginContext['format']>().toEqualTypeOf<<E>(error: E) => E>();
  });

  it('emits an event whose type is namespaced `<package>/<event>`', () => {
    expectTypeOf<PluginContext['emit']>().toEqualTypeOf<
      (make: () => TraceEvent<Namespaced>) => void
    >();
    expectTypeOf<'@acme/shields/raise'>().toExtend<Namespaced>();
    expectTypeOf<'compile'>().not.toExtend<Namespaced>();
  });
});

describe('TraceEventByType', () => {
  it("holds the third party's augmented event with its fields", () => {
    expectTypeOf<TraceEventByType['@acme/shields/raise']>().toEqualTypeOf<{
      sector: string;
      token: string;
    }>();
  });

  it('joins the event to TraceEvent', () => {
    expectTypeOf<TraceEvent<'@acme/shields/raise'>>().toEqualTypeOf<
      { readonly type: '@acme/shields/raise' } & {
        sector: string;
        token: string;
      }
    >();
    expectTypeOf<TraceEvent<'@acme/shields/raise'>>().toExtend<TraceEvent>();
  });
});

describe('GraphAnnotator', () => {
  it('maps a view to notes', () => {
    expectTypeOf<GraphAnnotator>().toEqualTypeOf<
      (view: BlueprintView) => readonly GraphNote[]
    >();
  });

  it("matches the third party's annotator by shape, which imports no devtools type", () => {
    expectTypeOf(shieldNotes).toExtend<GraphAnnotator>();
    expectTypeOf(
      devtools({ annotate: [shieldNotes] }),
    ).toEqualTypeOf<NexusPlugin>();
    inspect([], { annotate: [shieldNotes] });
  });
});

describe('GraphNote', () => {
  it('names a provider id and a label', () => {
    expectTypeOf<GraphNote['provider']>().toEqualTypeOf<string>();
    expectTypeOf<GraphNote['label']>().toEqualTypeOf<string>();
    expectTypeOf<{ provider: string; label: string }>().toExtend<GraphNote>();
  });
});

describe('displayName', () => {
  it('names any token', () => {
    expectTypeOf(displayName).toEqualTypeOf<(token: unknown) => string>();
  });
});

describe('describeValue', () => {
  it('describes any value', () => {
    expectTypeOf(describeValue).toEqualTypeOf<(value: unknown) => string>();
  });
});

describe('isForeign', () => {
  it('tests any value', () => {
    expectTypeOf(isForeign).toEqualTypeOf<(value: unknown) => boolean>();
  });
});

describe('errorBase', () => {
  it('takes a code, a name and a docs base', () => {
    expectTypeOf<Parameters<typeof errorBase>>().toEqualTypeOf<
      [
        code: string | ((fields: ErrorFields) => string),
        name: string,
        docs?: string,
      ]
    >();
  });
});

describe('NexusPlugin', () => {
  it("accepts the third party's plugin", () => {
    expectTypeOf(shields).returns.toEqualTypeOf<NexusPlugin>();
  });

  it('passes construct the ProviderView objects compile.check receives', () => {
    type Check = NonNullable<CompilePluginHooks['check']>;
    expectTypeOf<
      Parameters<Check>[0]['providers'][number]
    >().toEqualTypeOf<ProviderView>();
    expectTypeOf<
      Parameters<NonNullable<NexusPlugin['construct']>>[1]
    >().toEqualTypeOf<ProviderView>();
  });
});
