import { describe, expect, it } from 'vitest';

import {
  ESCAPE_FIXTURE,
  FIXTURE,
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
});
