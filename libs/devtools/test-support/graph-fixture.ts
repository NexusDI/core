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
      internal: false,
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
      internal: false,
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
      internal: false,
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
      internal: false,
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
      internal: false,
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
    { id: 'm1', name: '`md`', global: false, imports: [], exports: [] },
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
      internal: false,
    },
    {
      id: 'p1',
      token: '`**bold** md`\rnext',
      module: 'm1',
      lifetime: 'singleton',
      kind: 'value',
      eager: false,
      async: null,
      implementation: null,
      internal: false,
    },
  ],
  edges: [],
};

/** A graph with core's built-in REQUEST provider and nothing that depends on it. */
export const WITH_REQUEST: NexusGraph = {
  modules: [
    { id: 'm0', name: 'Meridian', global: false, imports: [], exports: [] },
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
      implementation: null,
      internal: false,
    },
    {
      id: 'request',
      token: 'REQUEST',
      module: 'm0',
      lifetime: 'scoped',
      kind: 'value',
      eager: true,
      async: null,
      implementation: null,
      internal: true,
    },
  ],
  edges: [],
};

/**
 * A plugin's plumbing provider under an ordinary id: the renderers hide it
 * by its internal flag.
 */
export const WITH_INTERNAL: NexusGraph = {
  modules: [
    { id: 'm0', name: 'Meridian', global: false, imports: [], exports: [] },
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
      implementation: null,
      internal: false,
    },
    {
      id: 'p1',
      token: 'RelayPlumbing',
      module: 'm0',
      lifetime: 'singleton',
      kind: 'value',
      eager: true,
      async: null,
      implementation: null,
      internal: true,
    },
  ],
  edges: [],
};

/**
 * Ids a hand-written JSON file can carry: Mermaid keywords and syntax, and a
 * module id equal to a provider's rendered name.
 */
export const HOSTILE_IDS: NexusGraph = {
  modules: [
    {
      id: 'end',
      name: 'Meridian',
      global: true,
      imports: ['p0'],
      exports: ['a-->b', 'p0'],
    },
    {
      id: 'p0',
      name: 'Navigation',
      global: false,
      imports: [],
      exports: ['x;y'],
    },
  ],
  providers: [
    {
      id: 'a-->b',
      token: 'ShipComputer',
      module: 'end',
      lifetime: 'singleton',
      kind: 'class',
      eager: true,
      async: null,
      implementation: null,
      internal: false,
    },
    {
      id: 'x;y',
      token: 'NavCharts',
      module: 'p0',
      lifetime: 'singleton',
      kind: 'factory',
      eager: true,
      async: null,
      implementation: null,
      internal: false,
    },
    {
      id: 'say "hi" \\ now',
      token: 'Comms',
      module: 'p0',
      lifetime: 'transient',
      kind: 'value',
      eager: false,
      async: null,
      implementation: null,
      internal: false,
    },
  ],
  edges: [
    { from: 'a-->b', to: 'x;y', kind: 'required' },
    { from: 'x;y', to: 'say "hi" \\ now', kind: 'lazy' },
  ],
};
