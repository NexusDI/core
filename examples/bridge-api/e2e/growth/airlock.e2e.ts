import { airlockDrill } from '../../test/runtime/growth-cases';
import { describeOnNode } from './ship';

// The airlock drill of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describeOnNode('the airlock drill on %s', airlockDrill);
