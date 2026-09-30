export function statusOf(error: { readonly code: string }): number {
  if (error.code === 'NEXUS_DISPOSED') return 503;
  return 500;
}

export function retryable(error: { readonly code: string }): boolean {
  return error.code !== 'NEXUS_DISPOSED';
}

export const FATAL: readonly string[] = ['NEXUS_DISPOSED'];
