import { Token, provide } from '@nexusdi/core';
import { Inject, Injectable, Module } from '@nexusdi/decorators';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  type CommandReceipt,
  type ICommandLink,
  type INavCharts,
} from '@nexusdi/federation-contracts';

/** The station's course plotter. */
export interface ICoursePlotter {
  course(to: string): string;
}

export const COURSE_PLOTTER = new Token<ICoursePlotter>('CoursePlotter');

/** The helm orders the command panel sends. */
export interface IHelmOrders {
  /** Sends `helm course` to the charted star `to`. */
  course(to: string): Promise<CommandReceipt>;
  /** Sends `helm burn` at `level`, 0 to 1. */
  burn(level: number): Promise<CommandReceipt>;
}

export const HELM_ORDERS = new Token<IHelmOrders>('HelmOrders');

/**
 * Plots a course through the contract's NAV_CHARTS. The `@Inject` accessor
 * writes its metadata where the shell's core reads it, so the shell builds
 * this class from another bundle.
 */
export class CoursePlotter implements ICoursePlotter {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;

  course(to: string): string {
    return `course to ${to}, heading ${this.charts.plot(to).heading}`;
  }
}

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

/**
 * The command station's section, written as an `@Module` class. `name`
 * keeps the module's name in graph(ship) after the production minifier
 * renames the class.
 */
@Module({
  name: 'CommandStation',
  providers: [
    provide(COURSE_PLOTTER, { useClass: CoursePlotter }),
    provide(HELM_ORDERS, { useClass: HelmOrders }),
  ],
  exports: [COURSE_PLOTTER, HELM_ORDERS],
})
export class CommandStation {}
