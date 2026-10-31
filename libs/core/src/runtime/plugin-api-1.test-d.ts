import { describe, expectTypeOf, it } from 'vitest';

import type {
  AnyToken,
  BlueprintView,
  Class,
  CompileContext,
  CompilePluginHooks,
  EdgeView,
  ErrorText,
  Lifetime,
  ModuleDefinition,
  ModuleRef,
  ModuleView,
  Nexus,
  NexusError,
  NexusPlugin,
  PluginContext,
  ProviderEntry,
  ProviderRewrite,
  ProviderView,
  Scope,
  TraceEvent,
  TraceEventByType,
} from '../index.js';

// Plugin api 1 (G4, G7): each field below keeps its name and type within 0.x.
// A new field keeps the version, so no test closes a view type. The key lists
// use toExtend, which fails on a removed or renamed field and passes on an
// added one. toEqualTypeOf is for closed unions only.

describe('BlueprintView (G4)', () => {
  it('keeps its fields and their types', () => {
    expectTypeOf<
      | 'phase'
      | 'complete'
      | 'root'
      | 'modules'
      | 'providers'
      | 'edges'
      | 'visible'
      | 'canonical'
    >().toExtend<keyof BlueprintView>();
    expectTypeOf<BlueprintView['complete']>().toEqualTypeOf<boolean>();
    expectTypeOf<BlueprintView['root']>().toEqualTypeOf<string>();
    expectTypeOf<BlueprintView['modules']>().toEqualTypeOf<
      readonly ModuleView[]
    >();
    expectTypeOf<BlueprintView['providers']>().toEqualTypeOf<
      readonly ProviderView[]
    >();
    expectTypeOf<BlueprintView['edges']>().toEqualTypeOf<readonly EdgeView[]>();
    expectTypeOf<BlueprintView['visible']>().toEqualTypeOf<
      (moduleId: string, token: AnyToken) => readonly string[]
    >();
    expectTypeOf<BlueprintView['canonical']>().toEqualTypeOf<
      (token: AnyToken) => AnyToken
    >();
  });

  it('closes phase', () => {
    expectTypeOf<BlueprintView['phase']>().toEqualTypeOf<
      'create' | 'load' | 'check'
    >();
  });
});

describe('ModuleView (G4)', () => {
  it('keeps its fields and their types', () => {
    expectTypeOf<
      | 'id'
      | 'name'
      | 'global'
      | 'imports'
      | 'loadImports'
      | 'exports'
      | 'definition'
      | 'replaced'
    >().toExtend<keyof ModuleView>();
    expectTypeOf<ModuleView['id']>().toEqualTypeOf<string>();
    expectTypeOf<ModuleView['name']>().toEqualTypeOf<string>();
    expectTypeOf<ModuleView['global']>().toEqualTypeOf<boolean>();
    expectTypeOf<ModuleView['imports']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ModuleView['loadImports']>().toEqualTypeOf<
      readonly string[]
    >();
    expectTypeOf<ModuleView['exports']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ModuleView['definition']>().toEqualTypeOf<ModuleDefinition>();
    expectTypeOf<
      ModuleView['replaced']
    >().toEqualTypeOf<ModuleDefinition | null>();
  });
});

describe('ProviderView (G4, G7)', () => {
  it('keeps its fields and their types', () => {
    expectTypeOf<
      | 'id'
      | 'token'
      | 'written'
      | 'name'
      | 'module'
      | 'kind'
      | 'lifetime'
      | 'eager'
      | 'implementation'
      | 'rewrittenBy'
      | 'inline'
      | 'unresolved'
    >().toExtend<keyof ProviderView>();
    expectTypeOf<ProviderView['id']>().toEqualTypeOf<string>();
    expectTypeOf<ProviderView['token']>().toEqualTypeOf<AnyToken>();
    expectTypeOf<ProviderView['written']>().toEqualTypeOf<AnyToken>();
    expectTypeOf<ProviderView['name']>().toEqualTypeOf<string>();
    expectTypeOf<ProviderView['module']>().toEqualTypeOf<string>();
    expectTypeOf<ProviderView['eager']>().toEqualTypeOf<boolean>();
    expectTypeOf<
      ProviderView['implementation']
    >().toEqualTypeOf<Class | null>();
    expectTypeOf<ProviderView['rewrittenBy']>().toEqualTypeOf<string | null>();
    expectTypeOf<ProviderView['inline']>().toEqualTypeOf<boolean>();
  });

  it('closes kind and lifetime', () => {
    expectTypeOf<ProviderView['kind']>().toEqualTypeOf<
      'class' | 'value' | 'factory' | 'alias'
    >();
    expectTypeOf<ProviderView['lifetime']>().toEqualTypeOf<Lifetime | null>();
    expectTypeOf<Lifetime>().toEqualTypeOf<
      'singleton' | 'scoped' | 'transient'
    >();
  });

  it('leaves the unresolved kind open to a new member in a minor', () => {
    type Entry = ProviderView['unresolved'][number];
    expectTypeOf<'optional'>().toExtend<Entry['kind']>();
    expectTypeOf<Entry['written']>().toEqualTypeOf<AnyToken>();
    // A plugin handles a kind it does not know through a default branch.
    const label = (kind: Entry['kind'] | 'a-kind-added-later'): string => {
      switch (kind) {
        case 'optional':
          return 'optional';
        default:
          return `unknown:${kind}`;
      }
    };
    expectTypeOf(label).returns.toEqualTypeOf<string>();
  });
});

describe('EdgeView (G4, G7)', () => {
  it('keeps its fields and their types', () => {
    expectTypeOf<'from' | 'to' | 'kind' | 'ordersBuild' | 'written'>().toExtend<
      keyof EdgeView
    >();
    expectTypeOf<EdgeView['from']>().toEqualTypeOf<string>();
    expectTypeOf<EdgeView['to']>().toEqualTypeOf<string>();
    expectTypeOf<EdgeView['ordersBuild']>().toEqualTypeOf<boolean>();
    expectTypeOf<EdgeView['written']>().toEqualTypeOf<AnyToken>();
  });

  it('closes kind', () => {
    expectTypeOf<EdgeView['kind']>().toEqualTypeOf<
      'required' | 'optional' | 'lazy' | 'all' | 'alias'
    >();
  });
});

describe('CompileContext and ProviderRewrite (G4)', () => {
  it('keeps the context members', () => {
    expectTypeOf<'phase' | 'configuredFrom' | 'canonical'>().toExtend<
      keyof CompileContext
    >();
    expectTypeOf<CompileContext['phase']>().toEqualTypeOf<
      'create' | 'load' | 'check'
    >();
    expectTypeOf<CompileContext['configuredFrom']>().toEqualTypeOf<
      (module: ModuleDefinition) => ModuleDefinition | undefined
    >();
    expectTypeOf<CompileContext['canonical']>().toEqualTypeOf<
      (token: AnyToken) => AnyToken
    >();
  });

  it('keeps the two rewrite forms', () => {
    expectTypeOf<ProviderRewrite>().toEqualTypeOf<
      | {
          readonly with: ProviderEntry;
          readonly pin?: true;
          readonly label?: string;
        }
      | { readonly remove: true }
    >();
  });
});

describe('NexusPlugin hooks (G4)', () => {
  it('keeps the hook signatures', () => {
    expectTypeOf<NexusPlugin['name']>().toEqualTypeOf<string>();
    expectTypeOf<NexusPlugin['apiVersion']>().toEqualTypeOf<number>();
    expectTypeOf<NexusPlugin['modules']>().toEqualTypeOf<
      readonly ModuleRef[] | undefined
    >();
    expectTypeOf<NexusPlugin['onInit']>().toEqualTypeOf<false | undefined>();
    expectTypeOf<NexusPlugin['compile']>().toEqualTypeOf<
      CompilePluginHooks | undefined
    >();
    expectTypeOf<NonNullable<NexusPlugin['tokenKey']>>().toEqualTypeOf<
      (token: AnyToken) => unknown
    >();
    expectTypeOf<NonNullable<NexusPlugin['construct']>>().toEqualTypeOf<
      (
        instance: unknown,
        provider: ProviderView,
        scope: string | null,
        container: Nexus | Scope,
      ) => unknown
    >();
    expectTypeOf<NonNullable<NexusPlugin['observe']>>().toEqualTypeOf<
      (event: TraceEvent) => void
    >();
    expectTypeOf<NonNullable<NexusPlugin['formatError']>>().toEqualTypeOf<
      (
        error: NexusError,
        view: BlueprintView | undefined,
      ) => ErrorText | undefined
    >();
    expectTypeOf<NonNullable<NexusPlugin['setup']>>().toEqualTypeOf<
      (context: PluginContext) => void | PromiseLike<void>
    >();
    expectTypeOf<NonNullable<NexusPlugin['dispose']>>().toEqualTypeOf<
      () => void | PromiseLike<void>
    >();
  });

  it('keeps the compile hook signatures', () => {
    expectTypeOf<NonNullable<CompilePluginHooks['module']>>().toEqualTypeOf<
      (
        module: ModuleDefinition,
        context: CompileContext,
      ) => ModuleRef | undefined
    >();
    expectTypeOf<NonNullable<CompilePluginHooks['provider']>>().toEqualTypeOf<
      (
        provider: ProviderView,
        context: CompileContext,
      ) => ProviderRewrite | undefined
    >();
    expectTypeOf<NonNullable<CompilePluginHooks['check']>>().toEqualTypeOf<
      (view: BlueprintView, report: (error: NexusError) => void) => void
    >();
  });
});

describe('PluginContext (G4)', () => {
  it('keeps its members', () => {
    expectTypeOf<PluginContext['container']>().toEqualTypeOf<Nexus>();
    expectTypeOf<PluginContext['blueprint']>().toEqualTypeOf<
      () => BlueprintView
    >();
    expectTypeOf<PluginContext['builtAsync']>().toEqualTypeOf<
      (providerId: string) => boolean | null
    >();
    expectTypeOf<PluginContext['format']>().toEqualTypeOf<<E>(error: E) => E>();
    expectTypeOf<PluginContext['emit']>().toEqualTypeOf<
      (
        make: () => TraceEvent<
          Extract<keyof TraceEventByType, `${string}/${string}`>
        >,
      ) => void
    >();
    expectTypeOf<
      'container' | 'blueprint' | 'builtAsync' | 'format' | 'emit'
    >().toExtend<keyof PluginContext>();
  });
});
