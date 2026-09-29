import { describe, expect, it } from 'vitest';

import { countEmit } from './emit.ts';

describe('countEmit', () => {
  it('counts helper calls and kept imports', () => {
    const text = [
      'import { a } from "./a.js";',
      'import { b } from "./b.js";',
      'let C = class C {};',
      'C = __decorate([x(), __metadata("design:paramtypes", [a])], C);',
    ].join('\n');
    expect(countEmit([{ path: 'c.js', text }], 3)).toEqual({
      emittedBytes: Buffer.byteLength(text),
      metadataCalls: 1,
      decorateCalls: 1,
      importsInSource: 3,
      importsKept: 2,
    });
  });
});
