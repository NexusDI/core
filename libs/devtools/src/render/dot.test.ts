import { describe, expect, it } from 'vitest';

import { ESCAPE_FIXTURE, FIXTURE } from '../../test-support/graph-fixture.js';
import { toDot } from '../index.js';

describe('toDot', () => {
  it('draws providers in module clusters with kind shapes and edge styles', () => {
    expect(toDot(FIXTURE)).toBe(
      String.raw`digraph nexus {
  rankdir=LR;
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
});
