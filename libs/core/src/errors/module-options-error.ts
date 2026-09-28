import { errorBase } from './nexus-error.js';

/** A Standard Schema issue, restated so errors/ imports nothing. */
export interface SchemaIssue {
  readonly message: string;
  readonly path?:
    ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

interface ModuleOptionsFields {
  readonly code:
    'NEXUS_MODULE_OPTIONS_MISSING' | 'NEXUS_INVALID_MODULE_OPTIONS';
  readonly module: string;
  /** The schema's issues, empty for NEXUS_MODULE_OPTIONS_MISSING. */
  readonly issues: readonly SchemaIssue[];
}

/** A configurable module was imported without with(), or its options failed validation. */
export class ModuleOptionsError extends errorBase<
  ModuleOptionsFields['code'],
  ModuleOptionsFields
>((fields) => fields.code, 'ModuleOptionsError') {}
