import { meridianRemote } from '@nexusdi/federation-contracts/rspack';

export default meridianRemote({
  name: 'federation_command',
  port: 4302,
  decorators: true,
});
