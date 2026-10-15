/**
 * The equivalence check of one scale cell (scale spec section 5). Plain
 * JavaScript, never compiled, so every library's bundle meets the same
 * checks. Runs in its own process:
 *
 *   node verify-child.mjs <bundle.mjs> <graph.json>
 *
 * and prints one JSON line: `{ digest, shared, built, kinds, ids }`,
 * `{ declared }` when the app's count, target or entries differ from the
 * model, `{ error }` when create or a get throws, or `{ load }` when the
 * bundle fails to import.
 * outcome.ts's classifyScale turns the line into an outcome.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [bundle, graphPath] = process.argv.slice(2);
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const providers = graph.providers;
const n = providers.length;
const print = (line) => console.log(JSON.stringify(line));

let scale;
try {
  ({ scale } = await import(pathToFileURL(bundle).href));
  if (scale === undefined) throw new Error('the bundle exports no scale app');
} catch (error) {
  print({ load: `${error.name}: ${error.message}` });
  process.exit(0);
}

/** An instance's dependency fields d0, d1, ... in constructor order. */
function depFields(instance) {
  const fields = [];
  while (`d${fields.length}` in instance)
    fields.push(instance[`d${fields.length}`]);
  return fields;
}

/**
 * The sorted lines `<id>(<dep ids>)`, one per provider, hashed. A dependency
 * is named by the model when the instance holds exactly the instance the
 * model's provider resolves to, so an alias dependency names the alias and
 * an alias's own line is `<alias>(<target>)`; anything else shows the id it
 * holds, which changes the digest.
 */
function digestOf(first) {
  const lines = providers
    .map((p, i) => {
      if (p.kind === 'alias') {
        const target = providers[p.deps[0]];
        return `${p.name}(${first[i] === first[p.deps[0]] ? target.name : '?'})`;
      }
      const o = first[i];
      const named = depFields(o ?? {}).map((d, j) =>
        p.deps[j] !== undefined && d === first[p.deps[j]]
          ? providers[p.deps[j]].name
          : `?${d?.id}`,
      );
      return `${o?.id}(${named.join(',')})`;
    })
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Target first, then every other provider in index order. */
async function resolveAll(get) {
  const instances = new Array(n);
  instances[graph.target] = await get(graph.target);
  for (let i = 0; i < n; i++)
    if (i !== graph.target) instances[i] = await get(i);
  return instances;
}

// An app that declares another graph than the model is a harness renderer
// bug, so the child reports it apart from anything the library threw.
const declared = [
  [
    'count',
    scale.count,
    n,
    `app declares ${scale.count} providers, the model ${n}`,
  ],
  [
    'target',
    scale.target,
    graph.target,
    `app targets ${scale.target}, the model ${graph.target}`,
  ],
  [
    'entries',
    JSON.stringify(scale.entries),
    JSON.stringify(graph.entries),
    `app declares ${JSON.stringify(scale.entries)}, the model ${JSON.stringify(graph.entries)}`,
  ],
].find(([, app, model]) => app !== model);
if (declared !== undefined) {
  print({ declared: `${declared[0]}: ${declared[3]}` });
  process.exit(0);
}

try {
  const handle = await scale.create();
  const get = scale.getAsync
    ? (i) => scale.getAsync(handle, i)
    : async (i) => scale.get(handle, i);
  const first = await resolveAll(get);
  const second = await resolveAll(get);

  const { counts, kinds: reported } = scale.built;
  // An alias is its target's instance: it has no fields of its own to check.
  const shared = providers.every((p, i) =>
    p.kind === 'alias'
      ? first[i] === first[p.deps[0]] && second[i] === first[i]
      : second[i] === first[i] &&
        p.deps.every((d, j) => first[i]?.[`d${j}`] === first[d]),
  );
  // A value and an alias never construct: their count stays 0, which
  // `kinds` checks.
  const constructs = (p) => p.kind !== 'value' && p.kind !== 'alias';
  const built =
    counts.length === n &&
    providers.every((p, i) => !constructs(p) || counts[i] === 1);
  const kinds = providers.every((p, i) =>
    constructs(p)
      ? reported[i] === p.kind
      : counts[i] === 0 && reported[i] === undefined,
  );
  // The digest is a multiset, so two providers with the same deps could
  // swap places unseen; each get(i) must return provider i itself.
  const ids = providers.every(
    (p, i) => p.kind === 'alias' || first[i]?.id === p.name,
  );
  print({ digest: digestOf(first), shared, built, kinds, ids });
} catch (error) {
  print({ error: `${error.name}: ${error.message}` });
}
