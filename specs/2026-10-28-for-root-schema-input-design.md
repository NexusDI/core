# forRoot takes the schema's input

Status: decided, 2026-10-28. The architect wrote section 3, and section 6 records the
tech lead's review.

Packages: `@nexusdi/core` changes its types. Its runtime and its bundle do not change.

Depends on: the code on `origin/release/0.4` at `411c2041`. Every claim below was checked
against `libs/core/src` there.

## 1. Problem

The Meridian demo found the gap. A configurable module with a Standard Schema checks its
options at startup, and the schema can fill in defaults or transform a field. The types
ignore that:

```ts
const CommsSchema = v.object({
  frequency: v.optional(v.number(), 1420),
  transport: v.picklist(['relay', 'laser']),
});
const COMMS_OPTIONS = new Token<v.InferOutput<typeof CommsSchema>>(
  'CommsOptions',
);
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema: CommsSchema,
});

Comms.forRoot({ transport: 'relay' }); // error today: frequency is missing
```

`ConfigurableModule<Opts>` types `forRoot(options: NoInfer<Opts>)` and the
`forRootAsync()` factory's result with `Opts`, the token's type. The token holds the
schema's output, so the caller has to pass every field the schema defaults. With a
transform the types get worse: `v.pipe(v.string(), v.transform(Number))` makes `forRoot()`
demand a number, and the schema then rejects that number at startup. That breaks the
promise "if it type-checks and starts, the wiring is right" from the type side: the
compiler accepts a value the schema refuses, and refuses a value the schema accepts.

The runtime already does the right thing. `validateOptions()` in
`libs/core/src/runtime/build.ts` runs the schema over the `forRoot()` value or the
factory's result and stores `result.value`, so the options token resolves to the
schema's output.

## 2. Users

- A module author with a schema writes defaults once, in the schema. Callers of
  `forRoot()` leave those fields out.
- A module author without a schema sees no change: `forRoot()` takes the token's type.
- A caller who names `ForRootAsyncConfig<X, D>` or `ConfigurableModule<X>` in their own
  code keeps compiling when the module has no schema. The rc has few such callers, and
  rc users need no migration path.

## 3. Design

### 3.1 defineModule infers the input

`defineModule()` gains a type parameter `Input`, inferred from the schema:

```ts
export function defineModule<
  Opts = never,
  Input = unknown,
  const P extends readonly unknown[] = [],
>(
  config: Omit<ModuleConfig, 'providers'> & {
    readonly providers?: ProviderEntries<P>;
    readonly options?: Token<Opts>;
    readonly schema?: StandardSchemaV1<Input, NoInfer<Opts>>;
  },
): [Opts] extends [never]
  ? ModuleDefinition
  : ConfigurableModule<Opts, unknown extends Input ? Opts : Input>;
```

TypeScript infers `Input` from the schema's `~standard.types.input`. Valibot, Zod and
ArkType fill that field. The schema's output must still be the token's type, so a schema
for a different shape fails as before.

Without a schema, or with a schema that omits `types`, TypeScript has no candidate for
`Input` and takes the default `unknown`. The default is `unknown` so that a call that
names only `Opts` (`defineModule<O>({ options, schema })`) still accepts a schema with
defaults, as it does today.

### 3.2 An unknown input falls back to the token's type

`Input` is `unknown` in two cases: by the default of section 3.1, and when a hand-written
schema declares `StandardSchemaV1<unknown, Opts>` or `<any, Opts>`. In both cases
`forRoot()` would accept any value. The return type maps an `unknown` or `any` input to
`Opts` with `unknown extends Input ? Opts : Input`. The conditional sits inline in the
signature, so core exports no new type.

A schema that declares no input type tells the compiler nothing, so the token's type
stays the contract. An author whose schema accepts a wider value names that input type in
the schema.

### 3.3 The module types

- `ConfigurableModule<Opts, Input = Opts>`: `forRoot` takes `NoInfer<Input>`, and
  `forRootAsync` takes `ForRootAsyncConfig<Input, D>`. Both become `readonly` function
  properties. TypeScript checks a method's parameters bivariantly, so with methods a
  module whose schema reads `{ port: 80 | 443 }` and produces `{ port: number }` would
  assign to `ConfigurableModule<{ port: number }>`, and generic code could then call
  `forRoot({ port: 8080 })`. That call type-checks and fails at startup. With properties
  the assignment fails, and a module whose schema only adds defaults still assigns.
  `options` stays `Token<Opts>`, since the token resolves to the schema's output.
  `schema` stays `StandardSchemaV1<unknown, Opts> | undefined`: under section 3.2 the
  `Input` parameter can differ from the schema's declared input, and every schema with
  output `Opts` fits the wider type. A caller who wants the input type reads
  `Parameters<M['forRoot']>[0]`.
- `ForRootAsyncConfig<Input, D>`: the factory returns `Input | PromiseLike<Input>`. The
  schema checks the factory's result, as `buildInto()` already does.
- `ConfigurableModuleConfig<Opts, Input = unknown>`: `schema?: StandardSchemaV1<Input,
Opts>`. The default `unknown` keeps `const c: ConfigurableModuleConfig<O>` open to a
  schema with defaults and to a hand-written `StandardSchemaV1<unknown, O>`.
  `defineModule()` does not read this type. Core only exports it.

### 3.4 What does not change

The runtime, the error codes and the decorator path. `@Module` takes no options token, so
it has no `forRoot()`.

## 4. Compatibility

The change breaks the types of rc users, so the commit carries `!` and a
`BREAKING CHANGE` footer:

- A module with a schema whose input differs from its output now types `forRoot()` and
  the async factory with the input. A call that passed the output's shape can fail where
  the input differs, as with a transform from a string.
- The first parameter of `ForRootAsyncConfig` names the factory's result, the schema's
  input.

A module without a schema, or with a schema whose input equals its output, compiles as
before.

## 5. Tests and docs

- `libs/core/src/definitions/for-root.test-d.ts`: a schema with a default lets
  `forRoot()` omit the field and keeps the token at the output type, a transform schema
  makes `forRoot()` take the input, the async factory may return the input, an
  `unknown`-input schema falls back to the token's type, and no schema keeps the token's
  type. A real zod schema (core gains zod 4.6.7 as a devDependency, the version `examples/meridian-systems` uses) checks vendor inference, and
  further cases cover the explicit `defineModule<O>` call, an annotated
  `ConfigurableModuleConfig<O>`, and the rejected assignment of a transforming module to
  `ConfigurableModule<O>`.
- `libs/core/src/definitions/for-root.test.ts`: a defaulted field reaches the provider
  through the token, from `forRoot()` and from `forRootAsync()`.
- `apps/docs/content/configurable-modules.mdx` and its region in
  `examples/meridian/src/pages/configurable-modules.md`: the schema section shows a
  default that `forRoot()` leaves out.
- `examples/meridian-systems/src/meridian-systems.module.ts` stops passing
  `frequency: DEFAULT_COMMS_FREQUENCY` to `Comms.forRoot()`. The demo passed it only to
  get past this gap, and the README says so.
- The TSDoc on the changed types feeds `apps/docs/content/api.mdx`.

## 6. Tech lead review

The tech lead approved with changes on 2026-10-28, after checking the design on TS 6.0.3
and TS 7.0.2 against valibot 1.5, zod 4.3 and zod/mini. Input inference works for
defaults, transforms and unions, field-level errors stay readable, and the fallback of
section 3.2 stands. The changes, all applied above:

1. `defineModule()` defaults `Input` to `unknown` (section 3.1).
2. `ConfigurableModuleConfig` defaults `Input` to `unknown` (section 3.3).
3. `forRoot` and `forRootAsync` become `readonly` function properties (section 3.3).
4. Section 3.2 states the mechanism: a schema without `types` reaches the default.
5. The demo drops its workaround (section 5).
6. Section 5 adds the zod case and the three cases from changes 1 to 3.
