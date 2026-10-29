import { loadRemote } from '@module-federation/runtime';
import type { ModuleRef } from '@nexusdi/core';
import { lazySection, type LazySection } from '@nexusdi/react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { stations } from './mf';
import { Tactical } from './ship/tactical';
import { STATIONS, type Station, type StationRow } from './stations';

/** What a station exposes at ./section: its module and its component. */
type SectionPackage = Record<string, ModuleRef | ComponentType>;

/** The section package of `station`, once /remotes.json registered it. */
async function sectionOf(station: StationRow): Promise<SectionPackage> {
  if ((await stations)[station.remote] === 'failed')
    throw new Error(
      `${station.remote} is not in /remotes.json, so the shell cannot load its section.`,
    );
  const section = await loadRemote<SectionPackage>(`${station.remote}/section`);
  if (section == null)
    throw new Error(`${station.remote}/section loaded with no exports.`);
  return section;
}

/** The export `key` of the section package, which must exist. */
function exportOf<T>(
  section: SectionPackage,
  station: Station,
  key: string,
): T {
  const found = section[key];
  if (found == null)
    throw new Error(`${station.remote}/section exports no ${key}.`);
  return found as T;
}

/** A station's lazy section and its lazy panel. */
export interface StationSection {
  readonly section: LazySection;
  readonly Panel: LazyExoticComponent<ComponentType>;
}

/** The lazy section and panel of each station, by station id. */
export const SECTIONS: ReadonlyMap<string, StationSection> = new Map(
  STATIONS.map((station) => [
    station.id,
    {
      // A remote cannot import the shell's Tactical, so each load grants it.
      section: lazySection(
        station.id,
        async () =>
          exportOf<ModuleRef>(
            await sectionOf(station),
            station,
            station.module,
          ),
        { imports: [Tactical] },
      ),
      Panel: lazy(async () => ({
        default: exportOf<ComponentType>(
          await sectionOf(station),
          station,
          station.panel,
        ),
      })),
    },
  ]),
);
