import {
  meridianRemote,
  type RemoteOptions,
} from '@nexusdi/federation-contracts/rspack';

/** The name and port every build of this remote shares. */
export const cartographyRemote = {
  name: 'federation_cartography',
  port: 4301,
} as const satisfies RemoteOptions;

export default meridianRemote(cartographyRemote);
