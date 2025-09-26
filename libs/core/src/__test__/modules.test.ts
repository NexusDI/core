import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Nexus } from '../index';
import {
  CoreModule,
  PaymentModule,
  PAYMENT_TOKEN,
  UserService,
  InventoryService,
  PaymentService,
  OrderModule,
  ShippingService,
} from './ecommerce.mocks';

describe('Module registration and container init', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  afterEach(async () => {
    await container.clear();
  });

  it('registers and resolves an unconfigurable module', async () => {
    await container.set(CoreModule);
    await container.init();
    expect(await container.get(UserService)).toBeInstanceOf(UserService);
    expect(await container.get(InventoryService)).toBeInstanceOf(
      InventoryService
    );
  });

  it('registers and resolves a configurable module', async () => {
    await container.set(PaymentModule.config({ gateway: 'stripe' }));
    await container.init();
    const service = await container.get(PAYMENT_TOKEN);
    expect(service).toBeInstanceOf(PaymentService);
    expect((service as any).config).toEqual({ gateway: 'stripe' });
  });

  it('registers and resolves a factory-configurable module (sync factory)', async () => {
    await container.set(
      PaymentModule.config({ useFactory: () => ({ gateway: 'paypal' }) })
    );
    await container.init();
    const service = await container.get(PAYMENT_TOKEN);
    expect(service).toBeInstanceOf(PaymentService);
    expect((service as any).config).toEqual({ gateway: 'paypal' });
  });

  it('registers and resolves a factory-configurable module (async factory)', async () => {
    await container.set(
      PaymentModule.config({ useFactory: async () => ({ gateway: 'adyen' }) })
    );
    await container.init();
    const service = await container.get(PAYMENT_TOKEN);
    expect(service).toBeInstanceOf(PaymentService);
    expect((service as any).config).toEqual({ gateway: 'adyen' });
  });

  it('calls init to initialize eager providers', async () => {
    await container.set(CoreModule);
    await container.init();
    // No eager providers in this mock, but should not throw
    expect(await container.get(UserService)).toBeInstanceOf(UserService);
  });

  it('registers a module that imports another module and exposes its service', async () => {
    await container.set(OrderModule);
    await container.init();
    // OrderModule imports ShippingModule, so ShippingService should be available
    const shippingService = await container.get(ShippingService);
    expect(shippingService.ship('order123')).toBe('Shipped order order123');
  });
});
