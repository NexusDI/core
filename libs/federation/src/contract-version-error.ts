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
  return new ContractVersionError(fields);
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_CONTRACT_VERSION: ContractVersionError;
  }
}
