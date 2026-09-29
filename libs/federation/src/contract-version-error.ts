import { errorBase } from '@nexusdi/core';

interface ContractVersionFields {
  readonly contract: string;
  readonly required: string;
  readonly provided: string;
}

/** A remote needs a newer minor, or another major, of a contract than the shell provides. */
export class ContractVersionError extends errorBase<
  'NEXUS_CONTRACT_VERSION',
  ContractVersionFields
>('NEXUS_CONTRACT_VERSION', 'ContractVersionError') {}

export function contractVersion(
  fields: ContractVersionFields,
): ContractVersionError {
  return new ContractVersionError(fields, {
    text: `${fields.contract} is needed at ${fields.required}, and the shell provides ${fields.provided}.\n  Fix: upgrade the shell's contracts package, or build the remote against ${fields.provided}.`,
  });
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_CONTRACT_VERSION: ContractVersionError;
  }
}
