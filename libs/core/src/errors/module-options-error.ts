import { NexusError } from './nexus-error.js';

/** A Standard Schema issue, restated so errors/ imports nothing. */
export interface SchemaIssue {
  readonly message: string;
  readonly path?:
    ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

function where(issue: SchemaIssue): string {
  if (!issue.path || issue.path.length === 0) return '';
  const keys = issue.path.map((segment) =>
    String(typeof segment === 'object' ? segment.key : segment),
  );
  return `${keys.join('.')}: `;
}

/** A configurable module was imported without with(), or its options failed validation. */
export class ModuleOptionsError extends NexusError {
  declare readonly code:
    'NEXUS_MODULE_OPTIONS_MISSING' | 'NEXUS_INVALID_MODULE_OPTIONS';
  readonly module: string;
  readonly issues: readonly SchemaIssue[];

  constructor(
    fields:
      | { code: 'NEXUS_MODULE_OPTIONS_MISSING'; module: string }
      | {
          code: 'NEXUS_INVALID_MODULE_OPTIONS';
          module: string;
          issues: readonly SchemaIssue[];
        },
  ) {
    const issues =
      fields.code === 'NEXUS_INVALID_MODULE_OPTIONS' ? fields.issues : [];
    const message =
      fields.code === 'NEXUS_MODULE_OPTIONS_MISSING'
        ? `${fields.module} is configurable and was imported without with().\n  Fix: import ${fields.module}.with(options).`
        : `${fields.module}.with() received options its schema rejects:\n${issues.map((issue) => `  ${where(issue)}${issue.message}`).join('\n')}`;
    super(fields.code, message);
    this.name = 'ModuleOptionsError';
    this.module = fields.module;
    this.issues = issues;
  }
}
