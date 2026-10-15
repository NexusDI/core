/**
 * The hand-built six-provider graph the scale tests share. The fake adapter
 * in fixtures/__test__/fake-scale.mjs implements this graph by hand.
 */
import {
  assemble,
  type ScaleGraph,
  type ScaleModule,
  type ScaleProvider,
} from './graph.ts';

const p = (
  index: number,
  kind: ScaleProvider['kind'],
  deps: number[],
  module: number,
): ScaleProvider => ({ index, name: `p${index}`, kind, deps, module });

/**
 * Two modules. m0 holds a value, a class and a factory and exports the last
 * two; m1 imports m0 and holds three classes, exporting the last two.
 */
export function six(): ScaleGraph {
  const providers = [
    p(0, 'value', [], 0),
    p(1, 'class', [0], 0),
    p(2, 'factory', [0, 1], 0),
    p(3, 'class', [1], 1),
    p(4, 'class', [2, 3], 1),
    p(5, 'class', [3], 1),
  ];
  const modules: ScaleModule[] = [
    { name: 'm0', tier: 0, imports: [], exports: [1, 2] },
    { name: 'm1', tier: 1, imports: [0], exports: [4, 5] },
  ];
  return assemble('mixed', 6, 1, providers, modules);
}

/**
 * The six-provider graph plus p6, an alias of p5 in m1 that m1 exports: the
 * smallest graph with every kind but an async factory. The alias holds p5's
 * instance and constructs nothing.
 */
export function sixWithAlias(): ScaleGraph {
  const g = six();
  g.providers.push(p(6, 'alias', [5], 1));
  g.modules[1].exports = [4, 5, 6];
  g.size = 7;
  return assemble('mixed', 7, 1, g.providers, g.modules);
}
