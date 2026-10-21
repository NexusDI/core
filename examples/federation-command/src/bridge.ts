import { Token } from '@nexusdi/core';
import { Inject } from '@nexusdi/decorators';
import { NAV_CHARTS, type INavCharts } from '@nexusdi/federation-contracts';

/** The bridge's course plotter. */
export interface IBridge {
  course(to: string): string;
}

export const BRIDGE = new Token<IBridge>('Bridge');

/**
 * Plots a course through the contract's NAV_CHARTS. The `@Inject` accessor
 * writes its metadata where the shell's core reads it, so the shell builds
 * this class from another bundle.
 */
export class Bridge implements IBridge {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;

  course(to: string): string {
    return `course to ${to}, heading ${this.charts.plot(to).heading}`;
  }
}
