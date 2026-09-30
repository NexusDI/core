export const isNexus = (error: { readonly code: string }): boolean =>
  error.code.startsWith('NEXUS_');

export const isNexusCode = (code: string): boolean => /^NEXUS_/.test(code);

export const familyOf = (error: { readonly code: string }): string =>
  error['code'].slice(0, 6);

export const named = (value: string): boolean => value.startsWith('NEXUS_');

export const PATTERN = new RegExp('^NEXUS_');
