import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Nexus } from '../index';
import {
  currencyValueProvider,
  exchangeRateValueProvider,
  orderIdFactoryProvider,
  taxRateFactoryProvider,
  CURRENCY_SYMBOL,
  EXCHANGE_RATE,
  ORDER_ID_FACTORY,
  TAX_RATE_FACTORY,
  UserService,
} from './ecommerce.mocks';

describe('Provider registration and setMany', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  afterEach(async () => {
    await container.clear();
  });

  it('registers and resolves value and factory providers (sync/async)', async () => {
    await container.set(CURRENCY_SYMBOL, { useValue: currencyValueProvider });
    await container.set(EXCHANGE_RATE, { useValue: exchangeRateValueProvider });
    await container.set(orderIdFactoryProvider);
    await container.set(taxRateFactoryProvider);

    await container.init();

    expect(await container.get(CURRENCY_SYMBOL)).toBe('$');
    expect(await container.get(EXCHANGE_RATE)).toBe(1.1);
    expect(typeof (await container.get(ORDER_ID_FACTORY))()).toBe('string');
    expect(await (await container.get(TAX_RATE_FACTORY))()).toBe(0.2);
  });

  it('registers multiple providers/services with setMany', async () => {
    await container.setMany(
      { token: CURRENCY_SYMBOL, useValue: currencyValueProvider },
      orderIdFactoryProvider,
      UserService
    );

    await container.init();
    expect(await container.get(CURRENCY_SYMBOL)).toBe('$');
    expect(typeof (await container.get(ORDER_ID_FACTORY))()).toBe('string');
    expect(await container.get(UserService)).toBeInstanceOf(UserService);
  });
});
