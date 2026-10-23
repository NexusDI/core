import { offlineHail } from '../../test/runtime/growth-cases';
import { describeOnNode } from './ship';

// The offline hail of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describeOnNode('the offline hail on %s', offlineHail);
