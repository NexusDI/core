import { fireRailgun } from '../../test/runtime/growth-cases';
import { describeOnNode } from './ship';

// The two railgun shots of test/runtime/growth-cases.ts on the Node servers.
// The workerd, Deno and Bun legs run the same case.
describeOnNode('two railgun shots on %s', fireRailgun);
