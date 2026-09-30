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

const SHAPE: Record<GraphProvider['kind'], string> = {
  class: 'box',
  factory: 'hexagon',
  value: 'parallelogram',
  alias: 'ellipse',
};

const EDGE: Record<GraphEdge['kind'], string> = {
  required: '',
  optional: ' [label="optional", style=dashed]',
  lazy: ' [label="lazy", style=dotted]',
  all: ' [label="all", style=bold]',
  alias: ' [label="alias", style=dashed]',
};

const HEADER = [
  'digraph nexus {',
  '  rankdir=LR;',
  '  node [fontname="Helvetica"];',
  '  edge [fontname="Helvetica"];',
];

/** The inside of a DOT double-quoted string. */
function escape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function quote(text: string): string {
  return `"${escape(text)}"`;
}

function label(lines: readonly string[]): string {
  return `"${lines.map(escape).join('\\n')}"`;
}

/** The graph as Graphviz DOT. Pure and deterministic. */
export function toDot(graph: NexusGraph, options: RenderOptions = {}): string {
  const lines = [...HEADER];
  const drawn = drawnProviders(graph);
  if (options.view === 'modules') {
    for (const m of graph.modules)
      lines.push(
        `  ${quote(m.id)} [label=${label([
          moduleTitle(m),
          providerCount(drawn, m.id),
        ])}, shape=box${m.global ? ', style=bold' : ''}];`,
      );
    for (const m of graph.modules)
      for (const to of m.imports)
        lines.push(`  ${quote(m.id)} -> ${quote(to)};`);
  } else {
    const exported = exportedIds(graph);
    for (const m of graph.modules) {
      const members = membersOf(drawn, m.id);
      if (members.length === 0) continue;
      lines.push(
        `  subgraph ${quote(`cluster_${m.id}`)} {`,
        `    label=${quote(moduleTitle(m))};`,
      );
      if (m.global) lines.push('    style=bold;');
      for (const p of members)
        lines.push(
          `    ${quote(p.id)} [label=${label(providerLines(p))}, shape=${
            SHAPE[p.kind]
          }${exported.has(p.id) ? ', peripheries=2' : ''}];`,
        );
      lines.push('  }');
    }
    for (const e of drawnEdges(graph, drawn))
      lines.push(`  ${quote(e.from)} -> ${quote(e.to)}${EDGE[e.kind]};`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
