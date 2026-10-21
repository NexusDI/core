import { errorBase } from '@nexusdi/core';

/** A hook or component of the package ran outside a NexusProvider. */
export class NoProviderError extends errorBase<
  'NEXUS_REACT_NO_PROVIDER',
  { readonly hook: string }
>('NEXUS_REACT_NO_PROVIDER', 'NoProviderError') {}

/** useService resolved a transient provider in render, with react() registered. */
export class TransientInRenderError extends errorBase<
  'NEXUS_REACT_TRANSIENT_IN_RENDER',
  { readonly token: string; readonly provider: string }
>('NEXUS_REACT_TRANSIENT_IN_RENDER', 'TransientInRenderError') {}

/** A ScopeProvider rendered under a scope after hydration. */
export class NestedScopeError extends errorBase<
  'NEXUS_REACT_NESTED_SCOPE',
  Record<never, never>
>('NEXUS_REACT_NESTED_SCOPE', 'NestedScopeError') {}

/** Two section modules claim one section name, or two copies of one section are in the page. */
export class SectionConflictError extends errorBase<
  'NEXUS_REACT_SECTION_CONFLICT',
  { readonly section: string }
>('NEXUS_REACT_SECTION_CONFLICT', 'SectionConflictError') {}

/** A section failed to load: its loader rejected, or load() or extend() did. The load error is its `cause`. */
export class SectionError extends errorBase<
  'NEXUS_REACT_SECTION_FAILED',
  { readonly section: string }
>('NEXUS_REACT_SECTION_FAILED', 'SectionError') {}

/** The line every package error's text ends with: the page for its code. */
const docs = (code: string) => `\n  Docs: https://nexus.js.org/errors/${code}`;

export function noProvider(hook: string): NoProviderError {
  return new NoProviderError(
    { hook },
    {
      text:
        `${hook} ran outside a NexusProvider, so it has no container to read.\n` +
        '  Fix: render the component under <NexusProvider>, or give the test a wrapper that renders one.' +
        docs('NEXUS_REACT_NO_PROVIDER'),
    },
  );
}

export function transientInRender(
  token: string,
  provider: string,
): TransientInRenderError {
  return new TransientInRenderError(
    { token, provider },
    {
      text:
        `useService(${token}) resolved the transient provider ${provider} in render, which builds a new instance on every render.\n` +
        '  Fix: resolve it in an event handler or an effect through useContainer(), make it scoped and read it under a ScopeProvider, or bind a factory function the component calls.' +
        docs('NEXUS_REACT_TRANSIENT_IN_RENDER'),
    },
  );
}

export function nestedScope(): NestedScopeError {
  return new NestedScopeError(
    {},
    {
      text:
        'A ScopeProvider rendered under another scope, and scopes do not nest in NexusDI 0.4.\n' +
        '  Fix: move the inner ScopeProvider beside the outer one, or let the subtree share the outer scope.' +
        docs('NEXUS_REACT_NESTED_SCOPE'),
    },
  );
}

export function sectionConflict(section: string): SectionConflictError {
  return new SectionConflictError(
    { section },
    {
      text:
        `Two section modules are loaded under the section name '${section}'.\n` +
        '  Fix: give each lazySection its own name, or remove the second copy of the section from the page.' +
        docs('NEXUS_REACT_SECTION_CONFLICT'),
    },
  );
}

/** A thrown value's message, or its name when the message is empty, or its string form. */
function describe(value: unknown): string {
  try {
    if (value instanceof Error) return value.message || value.name;
    return String(value);
  } catch {
    return 'a value without a string form';
  }
}

export function sectionFailed(section: string, cause: unknown): SectionError {
  const reason = describe(cause).replaceAll('\n', '\n    ');
  return new SectionError(
    { section },
    {
      cause,
      text:
        `Section '${section}' failed to load:\n    ${reason}\n` +
        '  Fix: correct the cause above, then offer retry() from an errorFallback.' +
        docs('NEXUS_REACT_SECTION_FAILED'),
    },
  );
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_REACT_NO_PROVIDER: NoProviderError;
    NEXUS_REACT_TRANSIENT_IN_RENDER: TransientInRenderError;
    NEXUS_REACT_NESTED_SCOPE: NestedScopeError;
    NEXUS_REACT_SECTION_CONFLICT: SectionConflictError;
    NEXUS_REACT_SECTION_FAILED: SectionError;
  }
}
