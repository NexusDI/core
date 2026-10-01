import { describe, expect, it } from 'vitest';

import {
  ESCAPE_FIXTURE,
  HOSTILE_IDS,
  FIXTURE,
  WITH_INTERNAL,
  WITH_REQUEST,
} from '../../test-support/graph-fixture.js';
import { toDot } from '../index.js';

describe('toDot', () => {
  it('draws providers in module clusters with kind shapes and edge styles', () => {
    expect(toDot(FIXTURE)).toBe(
      String.raw`digraph nexus {
  rankdir=LR;
  graph [fontname="Helvetica"];
  node [fontname="Helvetica"];
  edge [fontname="Helvetica"];
  subgraph "cluster_m0" {
    label="Meridian";
    "p0" [label="ShipComputer", shape=box];
    "p1" [label="Clock\nfactory, transient, on first get", shape=hexagon];
    "p3" [label="Computer\nalias", shape=ellipse];
  }
  subgraph "cluster_m1" {
    label="Navigation";
    "p2" [label="NavCharts\nStellarCharts", shape=box, peripheries=2];
  }
  subgraph "cluster_m2" {
    label="Telemetry (global)";
    style=bold;
    "p4" [label="Diagnostics\nvalue, scoped", shape=parallelogram, peripheries=2];
  }
  "p0" -> "p2";
  "p0" -> "p1" [label="optional", style=dashed];
  "p0" -> "p4" [label="all", style=bold];
  "p1" -> "p2" [label="lazy", style=dotted];
  "p3" -> "p0" [label="alias", style=dashed];
}` + '\n',
    );
  });

  it('draws the module import graph in the modules view', () => {
    expect(toDot(FIXTURE, { view: 'modules' })).toBe(
      String.raw`digraph nexus {
  rankdir=LR;
  graph [fontname="Helvetica"];
  node [fontname="Helvetica"];
  edge [fontname="Helvetica"];
  "m0" [label="Meridian\n3 providers", shape=box];
  "m1" [label="Navigation\n1 provider", shape=box];
  "m2" [label="Telemetry (global)\n1 provider", shape=box, style=bold];
  "m0" -> "m1";
  "m0" -> "m2";
}` + '\n',
    );
  });

  it('escapes quotes, backslashes and newlines in names', () => {
    const dot = toDot(ESCAPE_FIXTURE);
    expect(dot).toContain(String.raw`label="Bay \"7\"";`);
    expect(dot).toContain(
      String.raw`"p0" [label="a\"b#c<script>&\\\nz", shape=box];`,
    );
  });

  it('writes a lone carriage return as a line break', () => {
    const dot = toDot(ESCAPE_FIXTURE);
    expect(dot).toContain(
      String.raw`"p1" [label="${'`'}**bold** md${'`'}\nnext`,
    );
    expect(dot).not.toContain('\r');
  });

  it('skips a module with no providers in the providers view', () => {
    const graph = {
      ...FIXTURE,
      modules: [
        ...FIXTURE.modules,
        {
          id: 'm3',
          name: 'Empty',
          global: false,
          imports: [],
          exports: [],
        },
      ],
    };
    expect(toDot(graph)).not.toContain('cluster_m3');
  });

  it('returns the same bytes on every call', () => {
    expect(toDot(FIXTURE)).toBe(toDot(structuredClone(FIXTURE)));
  });

  it('leaves out REQUEST unless a provider depends on it', () => {
    expect(toDot(WITH_REQUEST)).not.toContain('REQUEST');
    expect(toDot(WITH_REQUEST, { view: 'modules' })).toContain('1 provider');
    const used = {
      ...WITH_REQUEST,
      edges: [{ from: 'p0', to: 'request', kind: 'required' as const }],
    };
    expect(toDot(used)).toContain('REQUEST');
    expect(toDot(used, { view: 'modules' })).toContain('2 providers');
  });

  it('leaves out an internal provider by its flag, whatever its id', () => {
    expect(toDot(WITH_INTERNAL)).not.toContain('RelayPlumbing');
    expect(toDot(WITH_INTERNAL, { view: 'modules' })).toContain('1 provider');
    const used = {
      ...WITH_INTERNAL,
      edges: [{ from: 'p0', to: 'p1', kind: 'required' as const }],
    };
    expect(toDot(used)).toContain('RelayPlumbing');
    expect(toDot(used, { view: 'modules' })).toContain('2 providers');
  });

  it('draws no edge to or from a provider it leaves out', () => {
    const hidden = {
      ...WITH_INTERNAL,
      edges: [{ from: 'p1', to: 'p0', kind: 'required' as const }],
    };
    expect(toDot(hidden)).not.toContain('"p1"');
    expect(toDot(hidden)).toBe(toDot({ ...WITH_INTERNAL, edges: [] }));
  });

  it('quotes and escapes every id', () => {
    const dot = toDot(HOSTILE_IDS);
    expect(dot).toContain('    "say \\"hi\\" \\\\ now" [label=');
    expect(dot).toContain('  "x;y" -> "say \\"hi\\" \\\\ now" [label="lazy"');
    expect(toDot(HOSTILE_IDS, { view: 'modules' })).toContain(
      '  "end" -> "p0";',
    );
  });
});
