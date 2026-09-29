import { errorBase } from '@nexusdi/core';

interface ContractVersionFields {
  readonly contract: string;
  readonly required: string;
  readonly provided: string;
}

/** A dependent needs another major, a newer minor, or a newer patch of the same minor of a contract than its provider has; at major 0, any other minor. */
export class ContractVersionError extends errorBase<
  'NEXUS_CONTRACT_VERSION',
  ContractVersionFields
>('NEXUS_CONTRACT_VERSION', 'ContractVersionError') {}

export function contractVersion(
  fields: ContractVersionFields,
): ContractVersionError {
  // At major 0 a newer minor is a breaking change, so only a newer patch of
  // the needed minor satisfies the dependent.
  const [major, minor] = fields.required.split('.');
  const newer = major === '0' ? `0.${minor}.x patch` : `${major}.x`;
  return new ContractVersionError(fields, {
    text: `${fields.contract} is needed at ${fields.required}, and the provider has ${fields.provided}.\n  Fix: build the provider against ${fields.required} or a newer ${newer}, or build the dependent against ${fields.provided}.`,
  });
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_CONTRACT_VERSION: ContractVersionError;
  }
}
