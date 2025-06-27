import { describe, it, expect, beforeEach } from 'vitest';
import { Module } from './module';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';

describe('@Module', () => {
  beforeEach(() => {
    if ((class TestModule {} as any)[(Symbol as any).metadata])
      delete (class TestModule {} as any)[(Symbol as any).metadata][
        METADATA_KEYS.MODULE_METADATA
      ];
  });

  it('should add module metadata to class', () => {
    @Module({ imports: [], services: [], providers: [], exports: [] })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata).toEqual({
      imports: [],
      services: [],
      providers: [],
      exports: [],
    });
  });

  it('should handle module with services', () => {
    class TestService {}
    @Module({ services: [TestService] })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.services).toEqual([TestService]);
  });

  it('should handle module with providers', () => {
    const TEST_TOKEN = new Token('TEST');
    @Module({
      providers: [{ token: TEST_TOKEN, useClass: class TestProvider {} }],
    })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.providers).toHaveLength(1);
    expect(metadata.providers[0].token).toBe(TEST_TOKEN);
  });

  it('should handle module with imports', () => {
    class ImportedModule {}
    @Module({ imports: [ImportedModule] })
    class TestModule {}
    const metadata = getMetadata(TestModule, METADATA_KEYS.MODULE_METADATA);
    expect(metadata.imports).toEqual([ImportedModule]);
  });
});
