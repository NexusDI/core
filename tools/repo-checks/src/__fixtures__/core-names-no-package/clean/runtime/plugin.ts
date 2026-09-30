export interface Plugin {
  readonly name: string;
}

export const byName = (plugins: readonly Plugin[], name: string) =>
  plugins.find((plugin) => plugin.name === name);
