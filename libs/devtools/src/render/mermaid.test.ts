import { describe, expect, it } from 'vitest';

import {
  ESCAPE_FIXTURE,
  HOSTILE_IDS,
  FIXTURE,
  WITH_INTERNAL,
  WITH_REQUEST,
} from '../../test-support/graph-fixture.js';
import { toMermaid } from '../index.js';

describe('toMermaid', () => {
  it('draws providers in module subgraphs with kind shapes and labelled edges', () => {
    expect(toMermaid(FIXTURE)).toBe(
      `flowchart LR
  subgraph m0["Meridian"]
    p0["ShipComputer"]
    p1{{"Clock<br/>factory, transient, on first get"}}
    p3(["Computer<br/>alias"])
  end
  subgraph m1["Navigation"]
    p2["NavCharts<br/>StellarCharts"]
  end
  subgraph m2["Telemetry (global)"]
    p4[/"Diagnostics<br/>value, scoped"/]
  end
  p0 --> p2
  p0 -. optional .-> p1
  p0 == all ==> p4
  p1 -. lazy .-> p2
  p3 -- alias --> p0
  classDef exported stroke-width:3px
  class p2,p4 exported
  style m2 stroke-width:3px
`,
    );
  });

  it('draws the module import graph in the modules view', () => {
    expect(toMermaid(FIXTURE, { view: 'modules' })).toBe(
      `flowchart LR
  m0["Meridian<br/>3 providers"]
  m1["Navigation<br/>1 provider"]
  m2["Telemetry (global)<br/>1 provider"]
  m0 --> m1
  m0 --> m2
  style m2 stroke-width:3px
`,
    );
  });

  it('turns quotes, hashes, angle brackets and ampersands into entity codes', () => {
    const mermaid = toMermaid(ESCAPE_FIXTURE);
    expect(mermaid).toContain('subgraph m0["Bay #quot;7#quot;"]');
    expect(mermaid).toContain('p0["a#quot;b#35;c#lt;script#gt;#amp;\\ z"]');
    expect(mermaid).not.toContain('<script>');
  });

  it('turns backticks into entity codes and a lone carriage return into a space', () => {
    const mermaid = toMermaid(ESCAPE_FIXTURE);
    expect(mermaid).toContain('subgraph m1["#96;md#96;"]');
    expect(mermaid).toContain(
      'p1[/"#96;**bold** md#96; next<br/>value, on first get"/]',
    );
    expect(mermaid).not.toMatch(/[`\r]/);
  });

  it('writes no classDef when nothing is exported', () => {
    expect(toMermaid(ESCAPE_FIXTURE)).not.toContain('classDef');
  });

  it('leaves out REQUEST unless a provider depends on it', () => {
    expect(toMermaid(WITH_REQUEST)).not.toContain('REQUEST');
    expect(toMermaid(WITH_REQUEST, { view: 'modules' })).toContain(
      '1 provider',
    );
    const used = {
      ...WITH_REQUEST,
      edges: [{ from: 'p0', to: 'request', kind: 'required' as const }],
    };
    expect(toMermaid(used)).toContain('REQUEST');
    expect(toMermaid(used, { view: 'modules' })).toContain('2 providers');
  });

  it('leaves out an internal provider by its flag, whatever its id', () => {
    expect(toMermaid(WITH_INTERNAL)).not.toContain('RelayPlumbing');
    expect(toMermaid(WITH_INTERNAL, { view: 'modules' })).toContain(
      '1 provider',
    );
    const used = {
      ...WITH_INTERNAL,
      edges: [{ from: 'p0', to: 'p1', kind: 'required' as const }],
    };
    expect(toMermaid(used)).toContain('RelayPlumbing');
    expect(toMermaid(used, { view: 'modules' })).toContain('2 providers');
  });

  it('draws no edge to or from a provider it leaves out', () => {
    const hidden = {
      ...WITH_INTERNAL,
      edges: [{ from: 'p1', to: 'p0', kind: 'required' as const }],
    };
    expect(toMermaid(hidden)).not.toContain('p1');
    expect(toMermaid(hidden)).toBe(toMermaid({ ...WITH_INTERNAL, edges: [] }));
  });

  it('names nodes by position, so no graph id reaches the output', () => {
    expect(toMermaid(HOSTILE_IDS)).toBe(
      [
        'flowchart LR',
        '  subgraph m0["Meridian (global)"]',
        '    p0["ShipComputer"]',
        '  end',
        '  subgraph m1["Navigation"]',
        '    p1{{"NavCharts<br/>factory"}}',
        '    p2[/"Comms<br/>value, transient, on first get"/]',
        '  end',
        '  p0 --> p1',
        '  p1 -. lazy .-> p2',
        '  classDef exported stroke-width:3px',
        '  class p0,p1 exported',
        '  style m0 stroke-width:3px',
        '',
      ].join('\n'),
    );
    expect(toMermaid(HOSTILE_IDS, { view: 'modules' })).toBe(
      [
        'flowchart LR',
        '  m0["Meridian (global)<br/>1 provider"]',
        '  m1["Navigation<br/>2 providers"]',
        '  m0 --> m1',
        '  style m0 stroke-width:3px',
        '',
      ].join('\n'),
    );
  });

  it('names an id that no module or provider has u<n>', () => {
    const dangling = {
      ...HOSTILE_IDS,
      modules: HOSTILE_IDS.modules.map((m) => ({ ...m, imports: ['end end'] })),
    };
    expect(toMermaid(dangling, { view: 'modules' })).toContain(
      '  m0 --> u0\n  m1 --> u0\n',
    );
  });
});
