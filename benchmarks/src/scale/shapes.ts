/**
 * The graph shapes of the scale suite (spec 2026-10-01, sections 3 and 14).
 * Each takes a size and the graph seed and draws from its own stream.
 */
import { mulberry32 } from '@nexusdi/bench-kit';

import { GRAPH_SEED, streamSeed } from './config.ts';
import {
  assemble,
  padName,
  type ProviderKind,
  type ScaleGraph,
  type ScaleModule,
  type ScaleProvider,
} from './graph.ts';

type Rand = () => number;

/** A uniform integer in lo..hi, both included. */
const randInt = (rand: Rand, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));

const provider = (
  index: number,
  size: number,
  kind: ProviderKind,
  deps: number[],
  module: number,
): ScaleProvider => ({
  index,
  name: padName('p', index, size),
  kind,
  deps,
  module,
});

/** One module that exports everything, so every provider is an entry. */
const singleModule = (size: number): ScaleModule[] => [
  {
    name: 'm0',
    tier: 0,
    imports: [],
    exports: Array.from({ length: size }, (_, i) => i),
  },
];

/**
 * The first ⌈n/5⌉ providers are leaves; every other provider takes two
 * distinct leaves drawn uniformly. Depth 1, mean fan-out 1.6, all classes.
 */
export function wide(size: number, seed = GRAPH_SEED): ScaleGraph {
  const rand = mulberry32(streamSeed('wide', size, seed));
  const leaves = Math.ceil(size / 5);
  const providers: ScaleProvider[] = [];
  for (let i = 0; i < size; i++) {
    const deps: number[] = [];
    if (i >= leaves) {
      const a = randInt(rand, 0, leaves - 1);
      let b = randInt(rand, 0, leaves - 1);
      while (b === a) b = randInt(rand, 0, leaves - 1);
      deps.push(a, b);
    }
    providers.push(provider(i, size, 'class', deps, 0));
  }
  return assemble('wide', size, seed, providers, singleModule(size));
}

/**
 * ⌈n/100⌉ chains of equal length (the last takes the remainder), laid out
 * one after another. Each provider after a chain's head takes its
 * predecessor and, with probability 0.6, one more distinct earlier provider
 * of its chain. The mean fan-out matches `wide`, so the two differ in depth.
 */
export function deep(size: number, seed = GRAPH_SEED): ScaleGraph {
  const rand = mulberry32(streamSeed('deep', size, seed));
  const chains = Math.ceil(size / 100);
  const length = Math.floor(size / chains);
  const providers: ScaleProvider[] = [];
  for (let c = 0; c < chains; c++) {
    const head = c * length;
    const end = c === chains - 1 ? size : head + length;
    for (let i = head; i < end; i++) {
      const deps: number[] = [];
      if (i > head) deps.push(i - 1);
      // Candidates for the extra dep: head..i-2, which excludes the predecessor.
      if (i - 1 > head && rand() < 0.6) deps.push(randInt(rand, head, i - 2));
      providers.push(provider(i, size, 'class', deps, 0));
    }
  }
  return assemble('deep', size, seed, providers, singleModule(size));
}
