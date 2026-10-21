import { loadRemote } from '@module-federation/runtime';
import type { ModuleRef } from '@nexusdi/core';
import { lazySection } from '@nexusdi/react';
import type { ComponentType } from 'react';

import { stations, type StationName } from './mf';

/** What a station exposes at ./section: its module and its component. */
type SectionPackage<M extends string, C extends string> = Record<M, ModuleRef> &
  Record<C, ComponentType>;

/** The section package of `station`, once /remotes.json registered it. */
async function sectionOf<P>(station: StationName): Promise<P> {
  if ((await stations)[station] === 'failed')
    throw new Error(
      `${station} is not in /remotes.json, so the shell cannot load its section.`,
    );
  const section = await loadRemote<P>(`${station}/section`);
  if (section == null)
    throw new Error(`${station}/section loaded with no exports.`);
  return section;
}

type CartographyPackage = SectionPackage<'Cartography', 'StarMap'>;
type CommandPackage = SectionPackage<'Command', 'CommandDeck'>;

export const cartography = () =>
  sectionOf<CartographyPackage>('federation_cartography');
export const command = () => sectionOf<CommandPackage>('federation_command');

export const Cartography = lazySection('cartography', () =>
  cartography().then((m) => m.Cartography),
);
export const Command = lazySection('command', () =>
  command().then((m) => m.Command),
);
