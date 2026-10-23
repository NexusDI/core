import { courseAndBurn } from '../../test/runtime/growth-cases';
import { describeOnNode } from './ship';

// The course and burn of test/runtime/growth-cases.ts on the Node servers. The
// workerd, Deno and Bun legs run the same case.
describeOnNode('a course and a burn on %s', courseAndBurn);
