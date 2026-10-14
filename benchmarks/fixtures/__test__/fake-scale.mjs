/**
 * A hand-written scale app over the six-provider graph of
 * src/scale/six.ts, shaped like a rendered app.ts (fixtures/scale-adapter.d.ts).
 * FAKE_BREAK selects one renderer fault for the verify-child and child tests.
 */
const brk = process.env.FAKE_BREAK;

const counts = new Uint32Array(6);
const kinds = new Array(6);
function __scaleBuilt(index, kind) {
  counts[index]++;
  kinds[index] = kind;
}

const p0 = { id: 'p0' };

class P1 {
  id = 'p1';
  constructor(d0) {
    this.d0 = d0;
    __scaleBuilt(1, 'class');
  }
}
// The product of p2's factory. It reports nothing: the factory body does.
class P2 {
  id = 'p2';
  constructor(d0, d1) {
    this.d0 = d0;
    this.d1 = d1;
    if (brk === 'factory-as-class') __scaleBuilt(2, 'class');
  }
}
const makeP2 = (d0, d1) => {
  const built = new P2(d0, d1);
  if (brk !== 'factory-as-class') __scaleBuilt(2, 'factory');
  return built;
};
class P3 {
  id = 'p3';
  constructor(d0) {
    this.d0 = d0;
    if (brk !== 'no-report') __scaleBuilt(3, 'class');
  }
}
class P4 {
  id = 'p4';
  constructor(d0, d1) {
    this.d0 = d0;
    this.d1 = d1;
    __scaleBuilt(4, 'class');
  }
}
class P5 {
  id = 'p5';
  constructor(d0, d1) {
    this.d0 = d0;
    if (d1 !== undefined) this.d1 = d1;
    __scaleBuilt(5, 'class');
  }
}

const value = () => {
  if (brk === 'value-as-factory') __scaleBuilt(0, 'factory');
  return p0;
};
const factory = (d0, d1) => {
  // The fault: the factory runs a second time and its result is dropped.
  if (brk === 'build-twice') makeP2(d0, d1);
  return makeP2(d0, d1);
};

/** [build, deps, singleton] per provider index. */
const REGISTRY = [
  [value, [], true],
  [(d0) => new P1(d0), [0], true],
  [factory, [0, 1], true],
  [(d0) => new P3(d0), [1], true],
  [(d0, d1) => new P4(d0, d1), brk === 'swap' ? [3, 2] : [2, 3], true],
  brk === 'swap-sinks'
    ? [(d0, d1) => new P5(d0, d1), [2, 3], true]
    : [(d0) => new P5(d0), [3], brk !== 'transient-sink'],
];
// The token table: swap-sinks points p4's and p5's slots at each other.
const T = brk === 'swap-sinks' ? [0, 1, 2, 3, 5, 4] : [0, 1, 2, 3, 4, 5];

class Container {
  cache = new Map();
  get(index) {
    if (this.cache.has(index)) return this.cache.get(index);
    const [build, deps, singleton] = REGISTRY[index];
    const instance = build(...deps.map((d) => this.get(d)));
    if (singleton) this.cache.set(index, instance);
    return instance;
  }
}

export const scale = {
  count: brk === 'declare-count' ? 7 : 6,
  entries: brk === 'declare-entries' ? [4] : [4, 5],
  target: brk === 'declare-target' ? 5 : 4,
  packages: [],
  built: { counts, kinds },
  create() {
    if (brk === 'throw') throw new Error('create broke');
    return new Container();
  },
  get(handle, index) {
    if (brk === 'async') throw new Error('get called where getAsync exists');
    return handle.get(T[index]);
  },
  ...(brk === 'async'
    ? { getAsync: async (handle, index) => handle.get(T[index]) }
    : {}),
};
