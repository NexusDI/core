export function statusOf(error: { readonly code: string }): number {
  if (error.code === 'NEXUS_DISPOSED') return 503;
  return 500;
}

export function levelOf(error: { readonly code: string }): string {
  switch (error.code) {
    case 'NEXUS_MISSING_PROVIDER':
      return 'warn';
    default:
      return 'error';
  }
}

export const HINTS = { NEXUS_MISSING_PROVIDER: 'register the provider' };
