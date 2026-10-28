/**
 * The swc settings for standard decorators. The rspack build gets them from
 * `meridianRemote({ decorators: true })` and vitest passes the same two
 * objects.
 */
export {
  decoratorsParser,
  decoratorsTransform,
} from '@nexusdi/federation-contracts/swc';
