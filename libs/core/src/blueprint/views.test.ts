import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import type { AnyToken } from '../definitions/guards.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { compile } from './compile.js';
import { buildView, sameToken, viewOfBlueprint } from './views.js';

interface INavComputer {
  readonly course: string;
}
const NAV = new Token<INavComputer>('NavComputer');
const Helm = defineModule({
  name: 'Helm',
  providers: [provide(NAV, { useValue: { course: 'Kepler-452b' } })],
  exports: [NAV],
});

describe('viewOfBlueprint', () => {
  it('returns one frozen object per blueprint', () => {
    const bp = compile({ root: Helm });
    const view = viewOfBlueprint(bp, sameToken);
    expect(Object.isFrozen(view)).toBe(true);
    expect(viewOfBlueprint(bp, sameToken)).toBe(view);
    expect(viewOfBlueprint(compile({ root: Helm }), sameToken)).not.toBe(view);
  });

  it("carries the root module's id, and visible() finds the root's providers", () => {
    const bp = compile({ root: Helm });
    const view = viewOfBlueprint(bp, sameToken);
    expect(view).toMatchObject({ phase: 'create', complete: true, root: 'm0' });
    expect(view.modules.find((m) => m.id === view.root)?.name).toBe('Helm');
    expect(view.visible(view.root, NAV)).toHaveLength(1);
  });
});

describe('buildView', () => {
  it('keys the token of visible() through the canonicalizer', () => {
    const bp = compile({ root: Helm });
    const copy = new Token<INavComputer>('NavComputer');
    const canon = (token: AnyToken): AnyToken => (token === copy ? NAV : token);
    const parts = {
      phase: 'create' as const,
      complete: true,
      root: bp.root,
      modules: [...bp.modules.values()],
      records: bp.providers.values(),
      visibility: bp.visibility,
      moduleExports: bp.moduleExports,
      edges: bp.edges,
      replaced: new Map(),
      rewrittenBy: new Map(),
    };
    expect(buildView(parts, canon).visible('m0', copy)).toEqual(
      bp.visibility.get('m0')?.get(NAV),
    );
    expect(buildView(parts, (token) => token).visible('m0', copy)).toEqual([]);
  });
});
