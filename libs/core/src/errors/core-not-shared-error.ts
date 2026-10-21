import { errorBase } from './nexus-error.js';

interface CoreNotSharedFields {
  /** The value, named: `the Token meridian/NavCharts`, `the module Cartography`. */
  readonly received: string;
  /** Where core met it: `load()`, `get()`, `Shell.providers[0]`, an import path, or null. */
  readonly where: string | null;
}

/** A value another copy of @nexusdi/core made reached this copy. */
export class CoreNotSharedError extends errorBase<
  'NEXUS_CORE_NOT_SHARED',
  CoreNotSharedFields
>('NEXUS_CORE_NOT_SHARED', 'CoreNotSharedError') {}
