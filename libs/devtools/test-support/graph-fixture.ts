import type { NexusGraph } from '../src/graph.js';

/** Every provider kind, every edge kind, a global module and exports. */
export const FIXTURE: NexusGraph = {
  modules: [
    {
      id: 'm0',
      name: 'Meridian',
      global: false,
      imports: ['m1', 'm2'],
      exports: [],
    },
    {
      id: 'm1',
      name: 'Navigation',
      global: false,
      imports: [],
      exports: ['p2'],
    },
    {
      id: 'm2',
      name: 'Telemetry',
      global: true,
      imports: [],
      exports: ['p4'],
    },
  ],
  providers: [
    {
      id: 'p0',
      token: 'ShipComputer',
      module: 'm0',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: null,
      implementation: 'ShipComputer',
    },
    {
      id: 'p1',
      token: 'Clock',
      module: 'm0',
      lifetime: 'transient',
      kind: 'factory',
      eager: false,
      async: null,
      implementation: null,
    },
    {
      id: 'p2',
      token: 'NavCharts',
      module: 'm1',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: null,
      implementation: 'StellarCharts',
    },
    {
      id: 'p3',
      token: 'Computer',
      module: 'm0',
      lifetime: null,
      kind: 'alias',
      eager: true,
      async: null,
      implementation: null,
    },
    {
      id: 'p4',
      token: 'Diagnostics',
      module: 'm2',
      lifetime: 'scoped',
      kind: 'value',
      eager: true,
      async: null,
      implementation: null,
    },
  ],
  edges: [
    { from: 'p0', to: 'p2', kind: 'required' },
    { from: 'p0', to: 'p1', kind: 'optional' },
    { from: 'p0', to: 'p4', kind: 'all' },
    { from: 'p1', to: 'p2', kind: 'lazy' },
    { from: 'p3', to: 'p0', kind: 'alias' },
  ],
};

/** A module and a token whose names carry every character a renderer escapes. */
export const ESCAPE_FIXTURE: NexusGraph = {
  modules: [
    { id: 'm0', name: 'Bay "7"', global: false, imports: [], exports: [] },
  ],
  providers: [
    {
      id: 'p0',
      token: 'a"b#c<script>&\\\nz',
      module: 'm0',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: null,
      implementation: null,
    },
  ],
  edges: [],
};
