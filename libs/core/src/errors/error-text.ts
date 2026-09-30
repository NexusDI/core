import type { NearMiss } from './missing-provider-error.js';

/** The text a formatter or a text pack gives an error. */
export interface ErrorText {
  readonly message: string;
  readonly hints?: readonly string[];
  readonly fix?: string;
  readonly nearMisses?: readonly NearMiss[];
}
