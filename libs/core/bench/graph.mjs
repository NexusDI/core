/**
 * A layered DAG in layers of 10 (spec section 14.6 of the benchmarks spec).
 * Position 4 is transient, position 9 scoped, the rest singletons. A class
 * takes positions p % 9 and (p + 1) % 9 of the layer below, so nothing
 * depends on a scoped class.
 */
export function makeGraph(core, size) {
  const providers = [];
  const lookups = [];
  let below = [];
  for (let layer = 0; layer * 10 < size; layer++) {
    const row = [];
    for (let p = 0; p < 10; p++) {
      const deps = layer === 0 ? [] : [below[p % 9], below[(p + 1) % 9]];
      const C = {
        [`C${layer}_${p}`]: class {
          static deps = deps;
        },
      }[`C${layer}_${p}`];
      row.push(C);
      if (p === 9) providers.push(core.provide(C, { lifetime: 'scoped' }));
      else if (p === 4)
        providers.push(core.provide(C, { lifetime: 'transient' }));
      else providers.push(C);
      if (p !== 9) lookups.push(C);
    }
    below = row;
  }
  return { providers, lookups };
}

/**
 * A realistic multi-module app: one global Config module exporting a Config token by useValue, `features` feature
 * modules of `perFeature` providers each, interface-first (Token +
 * useClass). Feature f imports the up-to-`imports` previous features.
 * Provider p of a feature depends on Config, on the feature's own previous
 * provider (p > 0), and, for p === 0, on the first token the imported
 * features export, when there is one. Each feature exports its last
 * `exports` tokens. The root imports Config and every feature. With the
 * defaults (30 features, 10 providers, 3 exports, 4 imports) this is 32
 * modules and 301 providers.
 */
export function makeModularGraph(
  core,
  { features = 30, perFeature = 10, exports = 3, imports = 4 } = {},
) {
  const configToken = new core.Token('Config');
  const Config = core.defineModule({
    name: 'Config',
    global: true,
    providers: [core.provide(configToken, { useValue: { a: 1 } })],
    exports: [configToken],
  });
  const feats = [];
  for (let f = 0; f < features; f++) {
    const priorFeats = feats.slice(Math.max(0, f - imports), f);
    const moduleImports = priorFeats.map((x) => x.module);
    const importedTokens = priorFeats.flatMap((x) => x.exportedTokens);
    const tokens = [];
    const providers = [];
    for (let p = 0; p < perFeature; p++) {
      const token = new core.Token(`f${f}p${p}`);
      tokens.push(token);
      const deps = [configToken];
      if (p > 0) deps.push(tokens[p - 1]);
      if (p === 0 && importedTokens.length > 0) deps.push(importedTokens[0]);
      const C = class {
        static deps = deps;
        constructor(...args) {
          this.args = args;
        }
      };
      providers.push(core.provide(token, { useClass: C }));
    }
    const exportedTokens = tokens.slice(perFeature - exports);
    feats.push({
      module: core.defineModule({
        name: `F${f}`,
        imports: moduleImports,
        providers,
        exports: exportedTokens,
      }),
      exportedTokens,
    });
  }
  const root = core.defineModule({
    name: 'Root',
    imports: [Config, ...feats.map((x) => x.module)],
  });
  const lookups = [configToken, ...feats.flatMap((x) => x.exportedTokens)];
  return { root, lookups };
}
