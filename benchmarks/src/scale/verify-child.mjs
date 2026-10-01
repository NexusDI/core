/**
 * The equivalence check of one scale cell (scale spec section 5). Plain
 * JavaScript, never compiled, so every library's bundle meets the same
 * checks. Runs in its own process:
 *
 *   node verify-child.mjs <bundle.mjs> <graph.json>
 *
 * and prints one JSON line: `{ digest, shared, built, kinds }`, `{ error }`
 * when create or a get throws, or `{ load }` when the bundle fails to import.
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

function digestOf(instances) {
  const lines = instances
    .map(
      (o) =>
        `${o?.id}(${depFields(o ?? {})
          .map((d) => d?.id)
          .join(',')})`,
    )
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

try {
  // A renderer that declares another graph than the model is broken before
  // any instance exists; the error names the field.
  if (scale.count !== n)
    throw new Error(`app declares ${scale.count} providers, the model ${n}`);
  if (scale.target !== graph.target)
    throw new Error(`app targets ${scale.target}, the model ${graph.target}`);
  if (scale.entries.join() !== graph.entries.join())
    throw new Error('app entries differ from the model');

  const handle = await scale.create();
  const get = scale.getAsync
    ? (i) => scale.getAsync(handle, i)
    : async (i) => scale.get(handle, i);
  const first = await resolveAll(get);
  const second = await resolveAll(get);

  const { counts, kinds: reported } = scale.built;
  const shared = providers.every(
    (p, i) =>
      second[i] === first[i] &&
      p.deps.every((d, j) => first[i]?.[`d${j}`] === first[d]),
  );
  // A value never constructs: its count stays 0, which `kinds` checks.
  const built =
    counts.length === n &&
    providers.every((p, i) => p.kind === 'value' || counts[i] === 1);
  const kinds = providers.every((p, i) =>
    p.kind === 'value'
      ? counts[i] === 0 && reported[i] === undefined
      : reported[i] === p.kind,
  );
  print({ digest: digestOf(first), shared, built, kinds });
} catch (error) {
  print({ error: `${error.name}: ${error.message}` });
}
