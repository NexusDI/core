import { runScenario } from '../run.ts';
import { Meridian, handles, log } from './meridian.ts';

console.log(JSON.stringify(await runScenario(Meridian, handles, log)));
