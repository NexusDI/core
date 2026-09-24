/**
 * The package-private entry `@nexusdi/core/testing` reaches the container's
 * internals through. The exports map does not publish it, so a consumer
 * cannot import it; `tools/repo-checks/src/core-layers.test.ts` allows only
 * testing/ to.
 */
export { createContainer, type ContainerInternals } from './runtime/nexus.js';
export { resolveModuleRef } from './definitions/define-module.js';
export { describeValue } from './definitions/describe.js';
export type { CompileOverrides } from './blueprint/overrides.js';
export type {
  FactoryDefinition,
  OverrideDefinition,
  PromiseTokenMessage,
} from './definitions/provide.js';
