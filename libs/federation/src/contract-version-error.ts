import { errorBase } from '@nexusdi/core';

interface ContractVersionFields {
  readonly contract: string;
  readonly required: string;
  readonly provided: string;
}

/** A dependent needs another major, or a newer minor, of a contract than its provider has. */
export class ContractVersionError extends errorBase<
  'NEXUS_CONTRACT_VERSION',
  ContractVersionFields
>('NEXUS_CONTRACT_VERSION', 'ContractVersionError') {}

export function contractVersion(
  fields: ContractVersionFields,
): ContractVersionError {
  const major = fields.required.split('.')[0];
  return new ContractVersionError(fields, {
    text: `${fields.contract} is needed at ${fields.required}, and the provider has ${fields.provided}.\n  Fix: build the provider against ${fields.required} or a newer ${major}.x, or build the dependent against ${fields.provided}.`,
  });
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_CONTRACT_VERSION: ContractVersionError;
  }
}
