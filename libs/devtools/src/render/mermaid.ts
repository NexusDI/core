import type { NexusGraph } from '../graph.js';
import {
  drawnEdges,
  drawnProviders,
  exportedIds,
  membersOf,
  moduleTitle,
  providerCount,
  providerLines,
  type GraphEdge,
  type GraphProvider,
  type RenderOptions,
} from './labels.js';

const ENTITY: Readonly<Record<string, string>> = {
  '&': '#amp;',
  '"': '#quot;',
  '#': '#35;',
  '<': '#lt;',
  '>': '#gt;',
  // A label that starts with a backtick reads as a Markdown string.
  '`': '#96;',
};

const SHAPE: Record<GraphProvider['kind'], readonly [string, string]> = {
  class: ['[', ']'],
  factory: ['{{', '}}'],
  value: ['[/', '/]'],
  alias: ['([', '])'],
};

const EDGE: Record<GraphEdge['kind'], string> = {
  required: '-->',
  optional: '-. optional .->',
  lazy: '-. lazy .->',
  all: '== all ==>',
  alias: '-- alias -->',
};

/** Label text with every character Mermaid reads as syntax as an entity code. */
function text(value: string): string {
  return value
    .replace(/[&"#<>`]/g, (c) => ENTITY[c] ?? c)
    .replace(/\r\n|\r|\n/g, ' ');
}

function label(lines: readonly string[]): string {
  return `"${lines.map(text).join('<br/>')}"`;
}

/**
 * The node name of each graph id: `m<i>` for the i-th module and `p<i>` for
 * the i-th provider. Mermaid reads a node name as syntax, and graph ids are
 * opaque strings, so no id is written as is. An id no module or provider
 * has, such as a dangling import in a hand-built graph, gets `u<n>`. A live
 * graph's names match core's ids until a load() adds modules.
 */
function nodeNames(graph: NexusGraph): (id: string) => string {
  const names = new Map<string, string>();
  graph.modules.forEach((m, i) => names.set(m.id, `m${i}`));
  graph.providers.forEach((p, i) => names.set(p.id, `p${i}`));
  let unknown = 0;
  return (id) => {
    let name = names.get(id);
    if (name === undefined) {
      name = `u${unknown++}`;
      names.set(id, name);
    }
    return name;
  };
}

/** The graph as a Mermaid flowchart. Pure and deterministic. */
export function toMermaid(
  graph: NexusGraph,
  options: RenderOptions = {},
): string {
  const lines = ['flowchart LR'];
  const drawn = drawnProviders(graph);
  const name = nodeNames(graph);
  const bold: string[] = [];
  if (options.view === 'modules') {
    for (const m of graph.modules) {
      lines.push(
        `  ${name(m.id)}[${label([moduleTitle(m), providerCount(drawn, m.id)])}]`,
      );
      if (m.global) bold.push(name(m.id));
    }
    for (const m of graph.modules)
      for (const to of m.imports) lines.push(`  ${name(m.id)} --> ${name(to)}`);
  } else {
    for (const m of graph.modules) {
      const members = membersOf(drawn, m.id);
      if (members.length === 0) continue;
      lines.push(`  subgraph ${name(m.id)}[${label([moduleTitle(m)])}]`);
      for (const p of members) {
        const [open, close] = SHAPE[p.kind];
        lines.push(
          `    ${name(p.id)}${open}${label(providerLines(p))}${close}`,
        );
      }
      lines.push('  end');
      if (m.global) bold.push(name(m.id));
    }
    for (const e of drawnEdges(graph, drawn))
      lines.push(`  ${name(e.from)} ${EDGE[e.kind]} ${name(e.to)}`);
    const exported = exportedIds(graph);
    const marked = drawn
      .filter((p) => exported.has(p.id))
      .map((p) => name(p.id));
    if (marked.length > 0)
      lines.push(
        '  classDef exported stroke-width:3px',
        `  class ${marked.join(',')} exported`,
      );
  }
  for (const id of bold) lines.push(`  style ${id} stroke-width:3px`);
  return `${lines.join('\n')}\n`;
}
