import { describe, expect, it } from 'vitest';

import { thrown } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { Nexus } from './nexus.js';
import type { Scope } from './scope.js';
import type { ScopeContext } from './scope-context.js';

/** A synchronous ScopeContext, enough to test the wiring without node:async_hooks. */
function stackContext(): ScopeContext {
  const stack: Scope[] = [];
  return {
    run(scope, fn) {
      stack.push(scope);
      try {
        return fn();
      } finally {
        stack.pop();
      }
    },
    current: () => stack.at(-1),
  };
}

describe('Nexus', () => {
  describe('runInScope', () => {
    it('throws NEXUS_NO_SCOPE_CONTEXT without a scopeContext, naming nodeScopeContext', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      await using shuttle = await ship.createScope();
      const error = thrown(() => ship.runInScope(shuttle, () => 1));
      expect(error).toMatchObject({ code: 'NEXUS_NO_SCOPE_CONTEXT' });
      expect((error as Error).message).toContain('nodeScopeContext()');
    });

    it('runs the function inside the scope and returns its value', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }), {
        scopeContext: stackContext(),
      });
      await using shuttle = await ship.createScope();
      expect(ship.runInScope(shuttle, () => ship.currentScope())).toBe(shuttle);
      expect(ship.currentScope()).toBeUndefined();
    });
  });

  describe('currentScope', () => {
    it('returns undefined without a scopeContext', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      expect(ship.currentScope()).toBeUndefined();
    });
  });
});
