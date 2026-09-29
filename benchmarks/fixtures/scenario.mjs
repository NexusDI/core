/**
 * The shared scenario (spec 4.4, 4.5). Plain JavaScript, never compiled, so
 * every toolchain cell runs the same checks. Prints one JSON line.
 */
import { pathToFileURL } from 'node:url';

const kind = (x) => (x === undefined || x === null ? null : (x.kind ?? null));
const out = {};
let adapter;
try {
  ({ adapter } = await import(pathToFileURL(process.argv[2]).href));
} catch (error) {
  console.log(JSON.stringify({ load: `${error.name}: ${error.message}` }));
  process.exit(0);
}

async function section(name, fn) {
  if (!adapter.lifetimes.includes(name))
    return void (out[name] = 'not-applicable');
  try {
    out[name] = await fn();
  } catch (error) {
    out[name] = { error: `${error.name}: ${error.message}` };
  }
}

let ship;
await section('singleton', async () => {
  ship = await adapter.ready();
  const bridge = ship.get('bridge');
  const computer = bridge.computer;
  const shield = bridge.shield;
  const router = shield?.router;
  return {
    bridge: kind(bridge),
    computer: kind(computer),
    charts: kind(bridge.charts),
    shield: kind(shield),
    router: kind(router),
    reactor: kind(computer?.reactor),
    sameBridge: ship.get('bridge') === bridge,
    sharedReactor:
      computer?.reactor !== undefined && computer.reactor === router?.reactor,
  };
});
await section('transient', async () => {
  const a = ship.get('drone');
  const b = ship.get('drone');
  return {
    distinct: a !== b && kind(a) === 'SurveyDrone',
    sharedComputer:
      a.computer === b.computer && a.computer === ship.get('bridge').computer,
  };
});
await section('scoped', async () => {
  const s1 = await adapter.scope(ship);
  const s2 = await adapter.scope(ship);
  const l1 = s1.get('flightLog');
  const result = {
    sameInScope: l1 === s1.get('flightLog') && kind(l1) === 'FlightLog',
    distinctAcrossScopes: l1 !== s2.get('flightLog'),
    sharedComputer: l1.computer === ship.get('bridge').computer,
  };
  await s1.close();
  await s2.close();
  return result;
});
if (ship !== undefined) await adapter.dispose?.(ship);
console.log(JSON.stringify(out));
