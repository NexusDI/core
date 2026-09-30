import type { ErrorTextPack } from '@nexusdi/core';

import type { ContractVersionError } from './contract-version-error.js';

/**
 * The text of federation's codes. Register it with
 * `errors({ text: [federationText] })`; without it a contract mismatch keeps
 * core's one-line message and its docs link.
 */
export const federationText = {
  NEXUS_CONTRACT_VERSION: (error: ContractVersionError) => {
    // At major 0 a newer minor is a breaking change, so only a newer patch of
    // the needed minor satisfies the dependent.
    const [major, minor] = error.required.split('.');
    const newer = major === '0' ? `0.${minor}.x patch` : `${major}.x`;
    return {
      message: `${error.contract} is needed at ${error.required}, and the provider has ${error.provided}.`,
      fix: `build the provider against ${error.required} or a newer ${newer}, or build the dependent against ${error.provided}.`,
    };
  },
} satisfies ErrorTextPack;
