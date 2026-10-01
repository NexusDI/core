// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bands,
  conceptPages,
  floorPages,
  pageKinds,
  teachingKinds,
  toolRoutes,
} from './navigation';

describe('navigation', () => {
  it('names the eleven concept pages in teaching order', () => {
    expect(conceptPages).toEqual([
      'tokens',
      'providers',
      'lifetimes',
      'modules',
      'configurable-modules',
      'scopes',
      'lifecycle',
      'lazy',
      'multi-providers',
      'errors',
      'introspection',
    ]);
  });

  it('gives every floor page a kind from the closed list', () => {
    for (const kind of Object.values(floorPages)) {
      expect(pageKinds).toContain(kind);
    }
    // `api` joins the floor with the API reference in phase 2, through the
    // doc-floor allowance (spec §14.3).
    expect(floorPages).toEqual({
      index: 'overview',
      'getting-started': 'tutorial',
      'api-errors': 'reference',
      api: 'reference',
    });
  });

  it('carries the code and blog kinds of amendments A2 and A3', () => {
    expect(pageKinds).toEqual([
      'overview',
      'tutorial',
      'concept',
      'question',
      'platform',
      'contract',
      'reference',
      'code',
      'blog',
      'post',
    ]);
  });

  it('lists the teaching kinds from the closed list', () => {
    expect(teachingKinds).toEqual(['tutorial', 'concept']);
    for (const kind of teachingKinds) expect(pageKinds).toContain(kind);
  });

  it('orders the sidebar bands as the spec does', () => {
    expect(bands).toEqual(['Start', 'Concepts', 'Guides', 'Migration', 'API']);
  });

  it('lists no tool route until the Playground exists', () => {
    expect(toolRoutes).toEqual([]);
  });

  it('imports neither React nor Next, so repo-checks can load it', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'navigation.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"](react|next)(\/|['"])/);
  });
});
