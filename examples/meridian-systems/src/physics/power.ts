/** A consumer that asks the power router for electricity this tick. */
export interface PowerLoad {
  /** The consumer's name, unique among the loads of one tick. */
  readonly id: string;
  /** Its place in the queue. The router serves 1 first. */
  readonly priority: number;
  /** The power it asks for, in W. */
  readonly demand: number;
  /** The share of its allocated power that ends in the coolant loop, 0 to 1. */
  readonly heatShare: number;
}

/**
 * The Meridian's deflector shield grid while raised. The
 * lowered grid stays on the router with a demand of 0 W.
 */
export const DEFLECTOR_GRID: PowerLoad = {
  id: 'shields',
  priority: 2,
  demand: 200e6,
  heatShare: 0.25,
};

/** What one load asked for and what the router gave it. */
export interface LoadRecord {
  readonly id: string;
  readonly priority: number;
  /** The power it asked for, in W. */
  readonly demand: number;
  /** The power it got, in W: either 0 or its whole demand. */
  readonly allocated: number;
}

/** The router's allocation at the end of a tick. */
export interface PowerRecord {
  /** The electric output the router shared out, in W. */
  readonly output: number;
  /** Every load, in the order the router served them. */
  readonly loads: readonly LoadRecord[];
  /** The ids of the loads that asked for power and got none, in serving order. */
  readonly shed: readonly string[];
}

function byPriorityThenId(a: PowerLoad, b: PowerLoad): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Shares `output` (W) among `loads` by priority, then by id.
 *
 * A load whose whole demand fits in what remains gets it. A load that does not
 * fit gets 0 and joins `shed`, and the router moves on to the next, so a later
 * and smaller load can still fit. The ids compare with `<` and `>`, which
 * order by UTF-16 code unit on every runtime, so a replay serves the loads in
 * the same order.
 */
export function allocatePower(
  output: number,
  loads: readonly PowerLoad[],
): PowerRecord {
  let remaining = output;
  const records: LoadRecord[] = [];
  const shed: string[] = [];
  for (const load of [...loads].sort(byPriorityThenId)) {
    const fits = load.demand <= remaining;
    const allocated = fits ? load.demand : 0;
    remaining -= allocated;
    records.push({
      id: load.id,
      priority: load.priority,
      demand: load.demand,
      allocated,
    });
    if (!fits) shed.push(load.id);
  }
  return { output, loads: records, shed };
}

/** The heat the allocated loads put into the coolant loop, `Σ heatShare · allocated`, in W. */
export function loadHeat(
  record: PowerRecord,
  loads: readonly PowerLoad[],
): number {
  const shares = new Map(loads.map((load) => [load.id, load.heatShare]));
  return record.loads.reduce(
    (sum, entry) => sum + (shares.get(entry.id) ?? 0) * entry.allocated,
    0,
  );
}
