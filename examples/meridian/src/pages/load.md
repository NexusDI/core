# How do I add a module after startup? examples

Regions for `apps/docs/content/load.mdx`. Every block runs as a test.

<!-- #region load-module -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface ISurveyDrone {
  survey(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

const log: string[] = [];
class ScoutDrone implements ISurveyDrone {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  onInit() {
    log.push('drone online');
  }
  survey() {
    return this.charts.plot('Kepler-442b');
  }
}

const Survey = defineModule({
  name: 'Survey',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => {
        log.push('charts downloaded');
        return { plot: (to) => `course to ${to}` };
      },
    }),
    provide(DRONE, { useClass: ScoutDrone }),
  ],
  exports: [DRONE],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
const before = ship.has(DRONE); // -> false
console.log(before);

await ship.load(Survey);
const steps = log; // -> ['charts downloaded', 'drone online']
console.log(steps);
const course = ship.get(DRONE).survey(); // -> 'course to Kepler-442b'
console.log(course);
```

<!-- #endregion load-module -->

<!-- #region load-invalid -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface ISurveyDrone {
  survey(): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class ScoutDrone implements ISurveyDrone {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  survey() {
    return this.charts.plot('Kepler-442b');
  }
}

const Survey = defineModule({
  name: 'Survey',
  providers: [provide(DRONE, { useClass: ScoutDrone })],
  exports: [DRONE],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
const error = await ship.load(Survey).catch((caught: unknown) => caught);
const errors = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = errors.map((inner) => inner.code); // -> ['NEXUS_MISSING_PROVIDER']
console.log(codes);
const unchanged = ship.has(DRONE); // -> false
console.log(unchanged);
```

<!-- #endregion load-invalid -->

<!-- #region load-twice -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISurveyDrone {
  readonly serial: number;
}
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

let launched = 0;
class ScoutDrone implements ISurveyDrone {
  readonly serial = ++launched;
}

const Survey = defineModule({
  name: 'Survey',
  providers: [provide(DRONE, { useClass: ScoutDrone })],
  exports: [DRONE],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await Promise.all([ship.load(Survey), ship.load(Survey)]);
await ship.load(Survey);
const built = launched; // -> 1
console.log(built);
```

<!-- #endregion load-twice -->

<!-- #region load-in-order -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISensor {
  readonly name: string;
}
const SURVEY_SENSOR = new Token<ISensor>('SurveySensor');
const SCIENCE_SENSOR = new Token<ISensor>('ScienceSensor');

const log: string[] = [];
const Survey = defineModule({
  name: 'Survey',
  providers: [
    provide(SURVEY_SENSOR, {
      useFactory: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push('survey');
        return { name: 'survey' };
      },
    }),
  ],
});
const Science = defineModule({
  name: 'Science',
  providers: [
    provide(SCIENCE_SENSOR, {
      useFactory: () => {
        log.push('science');
        return { name: 'science' };
      },
    }),
  ],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await Promise.all([ship.load(Survey), ship.load(Science)]);
const order = log; // -> ['survey', 'science']
console.log(order);
```

<!-- #endregion load-in-order -->

<!-- #region extend-scope -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface ISensorSweep {
  readonly target: string;
}
const SWEEP = new Token<ISensorSweep>('SensorSweep');

const Science = defineModule({
  name: 'Science',
  providers: [
    provide(SWEEP, {
      useFactory: () => ({ target: 'Kepler-442b' }),
      lifetime: 'scoped',
    }),
  ],
  exports: [SWEEP],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await using shuttle = await ship.createScope();
await ship.load(Science);

let code: string | null = null;
try {
  shuttle.get(SWEEP);
} catch (error) {
  code = isNexusError(error) ? error.code : null;
}
const beforeExtend = code; // -> 'NEXUS_LOADED_AFTER_SCOPE'
console.log(beforeExtend);

await shuttle.extend();
const target = shuttle.get(SWEEP).target; // -> 'Kepler-442b'
console.log(target);
```

<!-- #endregion extend-scope -->

<!-- #region load-global -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface ISensorSweep {
  readonly target: string;
}
const SWEEP = new Token<ISensorSweep>('SensorSweep');

const Science = defineModule({
  name: 'Science',
  global: true,
  providers: [provide(SWEEP, { useValue: { target: 'Kepler-442b' } })],
  exports: [SWEEP],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
const error = await ship.load(Science).catch((caught: unknown) => caught);
const message = error instanceof Error ? error.message : ''; // -> '[NEXUS_LOAD_GLOBAL_MODULE] module=Science. https://nexus.js.org/errors/NEXUS_LOAD_GLOBAL_MODULE'
console.log(message);
```

<!-- #endregion load-global -->
