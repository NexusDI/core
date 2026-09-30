import type { Plugin } from '@acme/core';

export const has = (plugins: readonly Plugin[]) =>
  plugins.some((plugin) => plugin.name === 'nexus:errors');

export const load = () => import('@acme/devtools');

export const loadAny = (name: string) => import(`@acme/${name}`);
