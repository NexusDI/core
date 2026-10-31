import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { shipSystems } from '../../app/ship-systems';
import { features, placardOf, type SeedModule } from './features';
import modules from './fixtures/modules.json';
import InstallLine, { installOf } from './InstallLine';
import { fixtureCentre } from './seed-ship';
import { DependencyCount, PackageList } from './Proof';
import ShipSystems from './ShipSystems';
// Vitest empties a stylesheet it imports, so the test reads the file for its text;
// the import names the file that `Styles.tsx` reads by path.
import './front-page.css';

// Vitest gives a static image import as a path and Next as an object with its
// size, so the tests stand in for the module that reads that object.
vi.mock('./art', () => {
  const base = (sizes: string) => ({
    src: '/art.webp',
    width: 2048,
    height: 512,
    sources: [{ type: 'image/webp', srcSet: '/art.webp 2048w' }],
    sizes,
  });
  return {
    FRAME: [-5, 0, 80, 20],
    cutawayBase: base,
    sideBase: base,
  };
});

describe('the ship systems strip', () => {
  it('links each feature to the page its ship system names', () => {
    expect(features).toHaveLength(7);
    for (const feature of features) {
      expect(
        shipSystems.some((system) => system.href === feature.href),
        feature.label,
      ).toBe(true);
    }
  });

  it('centres each feature on fixtures of the geometry, with no typed position', () => {
    for (const feature of features) {
      const [x, z] = fixtureCentre(feature.fixtures);
      expect(x, feature.label).toBeGreaterThan(0);
      expect(z, feature.label).toBeGreaterThan(0);
    }
    const router = fixtureCentre(['engineering.power-router']);
    expect(router[0]).toBeCloseTo(37, 6);
    expect(router[1]).toBeCloseTo(6.2, 6);
    // The router with the shield spans both fixtures.
    const both = fixtureCentre([
      'engineering.power-router',
      'reactor-bay.shadow-shield',
    ]);
    expect(both[0]).toBeCloseTo(40.15, 6);
    expect(both[1]).toBeCloseTo(7.8, 6);
    expect(() => fixtureCentre(['engineering.no-such-thing'])).toThrow(
      /no fixture/,
    );
  });

  it('names the module and its exports on the placard, from the seed', () => {
    const by = (label: string) => {
      const found = features.find((each) => each.label === label);
      if (!found) throw new Error(label);
      return found;
    };
    const seed = modules as SeedModule[];
    expect(placardOf(by('Extension points'), seed)).toBe(
      'Engineering exports ShipComputer.',
    );
    expect(placardOf(by('HTTP adapters'), seed)).toBe(
      'Meridian exports nothing.',
    );
  });

  it('crops the painted cutaway under each link, each crop its own scope, with the seed lit', () => {
    const { container } = render(<ShipSystems />);
    const crops = container.querySelectorAll('.nexus-systems__crop');
    expect(crops).toHaveLength(7);
    const scopes = [...crops].map((crop) =>
      crop.querySelector('[data-schematic]')?.getAttribute('data-schematic'),
    );
    expect(new Set(scopes).size).toBe(7);
    const styles = container.querySelector('.nexus-systems__crop style');
    expect(styles?.textContent).toContain('[data-room="bridge"]');
    expect(
      container.querySelector('.nexus-systems__crop img')?.getAttribute('alt'),
    ).toBe('');
  });

  it('draws a leader from each feature to its crop on the side view', () => {
    const { container } = render(<ShipSystems />);
    expect(container.querySelectorAll('.nexus-systems__leader')).toHaveLength(
      7,
    );
    expect(
      container
        .querySelector('.nexus-systems__hull')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('renders a link and a described placard for every feature', () => {
    render(<ShipSystems />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    const scopes = screen.getByRole('link', { name: /Scopes/ });
    const note = document.getElementById(
      scopes.getAttribute('aria-describedby') ?? '',
    );
    expect(note?.textContent).toBe('BridgeApi exports FlightLog.');
  });
});

describe('installOf', () => {
  it('installs the next tag during a release candidate window', () => {
    expect(installOf({ stable: '0.3.2', rc: '0.4.0-rc.3' })).toEqual({
      command: 'npm install @nexusdi/core@next',
      version: '0.4.0-rc.3',
      tag: 'next',
    });
  });

  it('installs the latest tag once the release is newer than any candidate', () => {
    expect(installOf({ stable: '0.4.0', rc: '0.4.0-rc.3' })).toEqual({
      command: 'npm install @nexusdi/core',
      version: '0.4.0',
      tag: 'latest',
    });
  });

  it('names no version when the checkout has no tags', () => {
    expect(installOf({ stable: null, rc: null })).toEqual({
      command: 'npm install @nexusdi/core@next',
      version: null,
      tag: null,
    });
  });
});

describe('the proof and install facts', () => {
  it('prints the dependency count of core', () => {
    const { container } = render(<DependencyCount />);
    expect(container.textContent).toBe('0');
  });

  it('lists core first as the one a reader needs, then the others with links', () => {
    render(<PackageList />);
    const [first, ...rest] = screen.getAllByRole('listitem');
    if (!first) throw new Error('no packages listed');
    expect(within(first).getByText('@nexusdi/core')).toBeTruthy();
    expect(within(first).getByText('The one you need')).toBeTruthy();
    const errors = rest.find((each) =>
      within(each).queryByText('@nexusdi/errors'),
    );
    if (!errors) throw new Error('errors package not listed');
    expect(
      within(errors)
        .getAllByRole('link')
        .map((each) => each.textContent),
    ).toEqual(['npm page of @nexusdi/errors', 'docs for @nexusdi/errors']);
  });
});

const frontPageCss = readFileSync(
  join(import.meta.dirname, 'front-page.css'),
  'utf8',
);

describe('the front page stylesheet', () => {
  it('has a rule for every class the server components write', () => {
    const { container } = render(
      <>
        <InstallLine releaseLine />
        <ShipSystems />
        <PackageList />
      </>,
    );
    const classes = new Set(
      [...container.querySelectorAll('[class]')].flatMap((element) =>
        element.className
          .toString()
          .split(' ')
          .filter((name) => name.startsWith('nexus-')),
      ),
    );
    const missing = [...classes].filter(
      (name) => !frontPageCss.includes(`.${name}`),
    );
    expect(missing).toEqual([]);
  });
});
