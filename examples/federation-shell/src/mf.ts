import { lazy, type ComponentType } from 'react';
import { registerRemotes, loadRemote } from '@module-federation/runtime';

// The providers this consumer loads at runtime. Edit `entry` to point at a
// different URL (`remoteEntry.js` is what every supported bundler emits at dev
// + build time). `name` is the provider build's federation container name and
// must match the provider's federation `name`; `alias` is the key you pass to
// loadRemote()/lazyProvider().
const PROVIDERS: Array<{ alias: string; name: string; entry: string }> = [
  {
    alias: 'federation-cartography',
    name: 'federation_cartography',
    entry: 'http://localhost:8101/remoteEntry.js',
  },
  {
    alias: 'federation-command',
    name: 'federation_command',
    entry: 'http://localhost:8102/remoteEntry.js',
  },
];

// `type` is omitted so the federation runtime auto-detects the entry format.
// The providers in this workspace are rspack-built and emit UMD;
// setting `type: 'module'` here breaks them with #RUNTIME-002.
registerRemotes(PROVIDERS.map((remote) => ({ ...remote })));

export function lazyProvider<Props = unknown>(
  alias: string,
  exposeName: string,
) {
  return lazy(async () => {
    const mod = await loadRemote<{ default: ComponentType<Props> }>(
      `${alias}/${exposeName}`,
    );
    return { default: mod!.default };
  });
}
