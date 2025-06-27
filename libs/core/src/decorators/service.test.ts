import { describe, it, expect, beforeEach } from 'vitest';
import { Provider, Service } from './service';
import { Token } from '../token';
import { getMetadata } from '../helpers';
import { METADATA_KEYS } from '../constants';

describe('@Service', () => {
  beforeEach(() => {
    if ((class TestService {} as any)[(Symbol as any).metadata])
      delete (class TestService {} as any)[(Symbol as any).metadata][
        METADATA_KEYS.SERVICE_METADATA
      ];
  });

  it('should add service metadata with class as token', () => {
    @Service()
    class TestService {}
    const metadata = getMetadata(TestService, METADATA_KEYS.PROVIDER_METADATA);
    expect(metadata.token).toBe(TestService);
  });

  it('should add service metadata with custom token', () => {
    const CUSTOM_TOKEN = new Token('CUSTOM_SERVICE');
    @Service(CUSTOM_TOKEN)
    class TestService {}
    const metadata = getMetadata(TestService, METADATA_KEYS.PROVIDER_METADATA);
    expect(metadata.token).toBe(CUSTOM_TOKEN);
  });
});

describe('@Provider', () => {
  it('should add provider metadata', () => {
    const PROVIDER_TOKEN = new Token('PROVIDER');
    @Provider(PROVIDER_TOKEN)
    class TestProvider {}
    expect(TestProvider).toBeDefined();
  });
});
