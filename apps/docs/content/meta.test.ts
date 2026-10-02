// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { bands } from '../app/navigation';
import meta from './_meta';

const entries = Object.values(meta as Record<string, unknown>).filter(
  (entry): entry is { type?: string; title?: string } =>
    typeof entry === 'object' && entry !== null,
);

describe('content/_meta.ts', () => {
  it('opens with the Start band and orders the bands as the spec does', () => {
    const separators = entries
      .filter((entry) => entry.type === 'separator')
      .map((entry) => entry.title);
    expect(Object.keys(meta)[0]).toBe('-- start');
    expect(bands.filter((band) => separators.includes(band))).toEqual(
      separators,
    );
  });

  it('links the Docs navbar entry to Getting started', () => {
    expect(meta.docs).toEqual({
      title: 'Docs',
      type: 'page',
      href: '/getting-started/',
    });
  });

  it('keeps the Blog navbar entry hidden until the posts migrate', () => {
    expect(meta.blog).toEqual({
      title: 'Blog',
      type: 'page',
      display: 'hidden',
    });
  });

  it('renders the landing page full width with no sidebar', () => {
    expect(meta.index).toEqual({
      title: 'NexusDI',
      theme: { layout: 'full', sidebar: false, toc: false },
    });
  });
});
