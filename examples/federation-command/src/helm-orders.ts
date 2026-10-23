import { Token } from '@nexusdi/core';
import { Injectable } from '@nexusdi/decorators';
import {
  COMMAND_LINK,
  type CommandReceipt,
  type ICommandLink,
} from '@nexusdi/federation-contracts';

/** The helm orders the command deck sends. */
export interface IHelmOrders {
  /** Sends `helm course` to the charted star `to`. */
  course(to: string): Promise<CommandReceipt>;
  /** Sends `helm burn` at `level`, 0 to 1. */
  burn(level: number): Promise<CommandReceipt>;
}

export const HELM_ORDERS = new Token<IHelmOrders>('HelmOrders');

/**
 * Sends helm orders over the contract's COMMAND_LINK. `@Injectable` writes
 * its deps where the shell's core reads them, so the shell builds this class
 * from another bundle.
 */
@Injectable({ deps: [COMMAND_LINK] })
export class HelmOrders implements IHelmOrders {
  constructor(private readonly link: ICommandLink) {}

  course(to: string): Promise<CommandReceipt> {
    return this.link.send({ system: 'helm', action: 'course', to });
  }

  burn(level: number): Promise<CommandReceipt> {
    return this.link.send({ system: 'helm', action: 'burn', level });
  }
}
