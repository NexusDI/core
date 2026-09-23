import { NexusError } from './nexus-error.js';

/** A place the token exists that the requester cannot see. */
export type NearMiss =
  | { readonly kind: 'not-exported'; readonly module: string }
  | { readonly kind: 'not-imported'; readonly module: string }
  | { readonly kind: 'same-description'; readonly module: string };

function hint(token: string, module: string, miss: NearMiss): string {
  switch (miss.kind) {
    case 'not-exported':
      return `${token} is provided in ${miss.module}, which does not export it.`;
    case 'not-imported':
      return `${token} is exported by ${miss.module}, which ${module} does not import.`;
    case 'same-description':
      return `A Token with the same description '${token}' exists in ${miss.module}. Tokens compare by identity, so use that Token object.`;
  }
}

function fix(
  token: string,
  module: string,
  misses: readonly NearMiss[],
): string {
  const first = misses[0];
  if (first?.kind === 'not-exported') {
    return `add ${token} to ${first.module}'s exports and import ${first.module} into ${module}.`;
  }
  if (first?.kind === 'not-imported')
    return `import ${first.module} into ${module}.`;
  return `provide ${token} in ${module} or in a module ${module} imports.`;
}

/** No provider of a token is visible where it was requested. */
export class MissingProviderError extends NexusError {
  declare readonly code: 'NEXUS_MISSING_PROVIDER';
  readonly token: string;
  readonly requester: string | null;
  readonly module: string;
  readonly nearMisses: readonly NearMiss[];

  constructor(fields: {
    token: string;
    requester: string | null;
    module: string;
    nearMisses: readonly NearMiss[];
  }) {
    const { token, requester, module, nearMisses } = fields;
    const head =
      requester === null
        ? `get(${token}) found no provider of ${token} visible in ${module}.`
        : `${requester} (module ${module}) depends on ${token}, but no provider of ${token} is visible in ${module}.`;
    const lines = [
      head,
      ...nearMisses.map((miss) => `  ${hint(token, module, miss)}`),
      `  Fix: ${fix(token, module, nearMisses)}`,
    ];
    super('NEXUS_MISSING_PROVIDER', lines.join('\n'));
    this.name = 'MissingProviderError';
    this.token = token;
    this.requester = requester;
    this.module = module;
    this.nearMisses = nearMisses;
  }
}
