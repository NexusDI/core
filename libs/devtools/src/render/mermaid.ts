import type { NexusGraph } from '../graph.js';
import {
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
    .replace(/[&"#<>]/g, (c) => ENTITY[c] ?? c)
    .replace(/\r?\n/g, ' ');
}

function label(lines: readonly string[]): string {
  return `"${lines.map(text).join('<br/>')}"`;
}

/** The graph as a Mermaid flowchart. Pure and deterministic. */
export function toMermaid(
  graph: NexusGraph,
  options: RenderOptions = {},
): string {
  const lines = ['flowchart LR'];
  const bold: string[] = [];
  if (options.view === 'modules') {
    for (const m of graph.modules) {
      lines.push(
        `  ${m.id}[${label([moduleTitle(m), providerCount(graph, m.id)])}]`,
      );
      if (m.global) bold.push(m.id);
    }
    for (const m of graph.modules)
      for (const to of m.imports) lines.push(`  ${m.id} --> ${to}`);
  } else {
    for (const m of graph.modules) {
      const members = membersOf(graph, m.id);
      if (members.length === 0) continue;
      lines.push(`  subgraph ${m.id}[${label([moduleTitle(m)])}]`);
      for (const p of members) {
        const [open, close] = SHAPE[p.kind];
        lines.push(`    ${p.id}${open}${label(providerLines(p))}${close}`);
      }
      lines.push('  end');
      if (m.global) bold.push(m.id);
    }
    for (const e of graph.edges)
      lines.push(`  ${e.from} ${EDGE[e.kind]} ${e.to}`);
    const exported = exportedIds(graph);
    const marked = graph.providers
      .filter((p) => exported.has(p.id))
      .map((p) => p.id);
    if (marked.length > 0)
      lines.push(
        '  classDef exported stroke-width:3px',
        `  class ${marked.join(',')} exported`,
      );
  }
  for (const id of bold) lines.push(`  style ${id} stroke-width:3px`);
  return `${lines.join('\n')}\n`;
}
