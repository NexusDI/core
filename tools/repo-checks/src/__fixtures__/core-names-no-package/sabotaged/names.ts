export interface Plugin {
  readonly name: string;
}

export const hasErrors = (plugins: readonly Plugin[]) =>
  plugins.some((plugin) => plugin.name === 'nexus:errors');

export const traced = (kind: string) => `nexus:${kind}`;

export const hint = 'install @acme/errors for the full text';
