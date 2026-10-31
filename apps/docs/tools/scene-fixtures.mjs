import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BlueprintError, Nexus, isNexusError } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import {
  DRONE,
  NAV_CHARTS,
  SEED,
  amend,
  clearShutdownLog,
  rootOf,
  shutdownLog,
} from '@nexusdi/meridian/scenes/front-page';

/**
 * Runs the front page's ship (site-ux 5.5) in Node against the workspace-built
 * core, once for the seed and once for each drill of 5.10, and writes one JSON
 * file per state to `components/front-page/fixtures/`.
 *
 * Each file holds the state, the check's result with `errors()` and without
 * it, the trace of a launch where the drill has one, and the terminal text.
 * The server renders the bay from `seed.json`, and the e2e spec reads its
 * expected codes from these files. Every `*Ms` field of a trace event is
 * zeroed, so a rebuild writes the same bytes.
 *
 * Error fields are read the way any consumer reads them: an error class that
 * core exports, the own enumerable fields of a `NexusError`, and `cause`. The
 * script parses no message.
 */

const docsRoot = join(import.meta.dirname, '..');
const outDir = join(docsRoot, 'components', 'front-page', 'fixtures');

/** The bridge readout of site-ux 4.4. */
const DESTINATION = 'Kepler-442b';

/** The drills of site-ux 5.10, each a name and the state it leaves the ship in. */
export const DRILLS = [
  { id: 'seed', title: 'The seed ship', state: SEED, launch: true },
  {
    id: 'cut-comms',
    title: 'Cut the Comms conduit',
    state: amend(SEED, { conduits: { 'Tactical>Comms': false } }),
  },
  {
    id: 'cut-engineering',
    title: 'Cut the Engineering conduit',
    state: amend(SEED, { conduits: { 'Tactical>Engineering': false } }),
  },
  {
    id: 'cut-both',
    title: 'Cut both conduits',
    state: amend(SEED, {
      conduits: { 'Tactical>Comms': false, 'Tactical>Engineering': false },
    }),
  },
  {
    id: 'offline-computer',
    title: 'Take ShipComputer offline',
    state: amend(SEED, { systems: { ShipComputer: false } }),
  },
  {
    id: 'hatch-computer',
    title: "Close Engineering's ShipComputer hatch",
    state: amend(SEED, { hatches: { ShipComputer: false } }),
  },
  {
    id: 'hatch-drone',
    title: "Close Tactical's SurveyDrone hatch",
    state: amend(SEED, { hatches: { SurveyDrone: false } }),
    launch: true,
    lookup: DRONE,
  },
  {
    id: 'chart-server-down',
    title: 'Chart server unreachable',
    state: amend(SEED, { chartServerReachable: false }),
    launch: true,
  },
];

/** A copy of `value` with every number under a key ending in `Ms` set to 0. */
export function zeroMs(value) {
  if (Array.isArray(value)) return value.map(zeroMs);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, each]) => [
      key,
      key.endsWith('Ms') && typeof each === 'number' ? 0 : zeroMs(each),
    ]),
  );
}

/** What an error carries: its fields, code, message and the message of its cause. */
function describeError(error) {
  if (!isNexusError(error)) {
    return { code: null, fields: {}, message: String(error?.message ?? error) };
  }
  const { errors: inner, ...fields } = error;
  const entry = {
    code: error.code,
    fields: JSON.parse(JSON.stringify(fields)),
    message: error.message,
  };
  if (error instanceof BlueprintError) {
    entry.entries = inner.map((each) => describeError(each));
  }
  if (error.cause !== undefined) {
    entry.cause = { message: String(error.cause?.message ?? error.cause) };
  }
  return entry;
}

function checkOnce(root, plugins) {
  try {
    const report = Nexus.check(root, { plugins });
    return { ok: true, unchecked: report.unchecked, error: null };
  } catch (error) {
    return { ok: false, unchecked: [], error: describeError(error) };
  }
}

function checkTerminal(result) {
  return [
    '$ npm run preflight',
    result.ok ? 'pre-flight ok' : result.error.message,
    result.ok ? 'exit 0' : 'exit 1',
  ].join('\n');
}

/** Launches `root`, reads the bridge, and disposes the ship, recording the trace. */
async function launchOnce(state, lookup) {
  const events = [];
  const disposal = [];
  let sink = events;
  const record = (event) => sink.push(zeroMs(event));
  clearShutdownLog();
  const out = {
    ok: false,
    error: null,
    readout: null,
    lookup: null,
    trace: events,
    disposal,
    shutdown: [],
  };
  let ship;
  try {
    ship = await Nexus.create(rootOf(state), {
      plugins: [errors(), trace(record)],
    });
  } catch (error) {
    out.error = describeError(error);
    out.shutdown = [...shutdownLog];
    return out;
  }
  out.ok = true;
  if (lookup === undefined) {
    out.readout = ship.get(NAV_CHARTS).plot(DESTINATION);
  } else {
    try {
      ship.get(lookup);
    } catch (error) {
      out.lookup = { has: ship.has(lookup), error: describeError(error) };
    }
  }
  sink = disposal;
  await ship[Symbol.asyncDispose]();
  out.shutdown = [...shutdownLog];
  return out;
}

function launchTerminal(launch) {
  const lines = ['$ npm start', 'ship = await Nexus.create(Meridian)'];
  if (!launch.ok) {
    lines.push(launch.error.message, 'exit 1');
  } else if (launch.lookup !== null) {
    lines.push('Ready.', launch.lookup.error.message);
  } else {
    lines.push('Ready.', launch.readout);
  }
  return lines.join('\n');
}

/** The fixture of one drill. */
export async function fixtureOf(drill) {
  const root = rootOf(drill.state);
  const withErrors = checkOnce(root, [errors()]);
  const plain = checkOnce(root, []);
  const fixture = {
    id: drill.id,
    title: drill.title,
    state: drill.state,
    check: { withErrors, plain },
    terminal: {
      check: checkTerminal(withErrors),
      checkPlain: checkTerminal(plain),
      launch: null,
    },
    launch: null,
  };
  if (drill.launch === true && withErrors.ok) {
    fixture.launch = await launchOnce(drill.state, drill.lookup);
    fixture.terminal.launch = launchTerminal(fixture.launch);
  }
  return fixture;
}

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const drill of DRILLS) {
    const fixture = await fixtureOf(drill);
    writeFileSync(
      join(outDir, `${drill.id}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  }
  console.log(`scene-fixtures: wrote ${DRILLS.length} states to ${outDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
