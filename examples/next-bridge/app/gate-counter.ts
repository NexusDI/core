interface GateCounters {
  evaluations: number;
  creates: number;
}

const KEY = Symbol.for('next-bridge.gate');

/** One object per process: every module instance reads the same globalThis slot. */
export function gateCounters(): GateCounters {
  const slot = globalThis as { [KEY]?: GateCounters };
  slot[KEY] ??= { evaluations: 0, creates: 0 };
  return slot[KEY];
}
