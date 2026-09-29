const brk = process.env.FAKE_BREAK;
const reactor = { kind: 'ReactorCore' };
const computer = { kind: 'ShipComputer', reactor };
const router = { kind: 'PowerRouter', reactor };
const shield = { kind: 'ShieldGrid', router };
const charts = { kind: 'NavCharts' };
const bridge = {
  kind: 'Bridge',
  computer,
  charts: brk === 'charts' ? undefined : charts,
  shield,
};
const ship = {
  get(name) {
    if (name === 'drone') {
      if (brk === 'throw') throw new Error('drone broke');
      return { kind: 'SurveyDrone', computer };
    }
    return { bridge, computer, charts, shield, router, reactor }[name];
  },
};
export const adapter = {
  lifetimes:
    brk === 'singletons-only'
      ? ['singleton']
      : ['singleton', 'transient', 'scoped'],
  ready: () => ship,
  scope: () => {
    const log = { kind: 'FlightLog', computer };
    return { get: (n) => (n === 'flightLog' ? log : ship.get(n)), close() {} };
  },
};
