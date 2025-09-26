import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Inject, Nexus } from '../index';
import {
  CoreModule,
  UserService,
  InventoryService,
  PaymentService,
  PAYMENT_TOKEN,
  InvoiceService,
  OrderService,
  DiscountService,
  DISCOUNT_TOKEN,
  INVOICE_TOKEN,
  PAYMENT_CONFIG,
  ProductService,
} from './ecommerce.mocks';
import { Token } from '../index';

describe('Service registration and injection', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  afterEach(async () => {
    await container.dispose();
  });

  it('registers and resolves undecorated and decorated services', async () => {
    await container.set(CoreModule);
    await container.init();

    const userService = await container.get(UserService);
    const inventoryService = await container.get(InventoryService);

    expect(userService.getUser('u1')).toEqual({ id: 'u1', name: 'Alice' });
    expect(inventoryService.getStock('p1')).toBe(100);
  });

  it('should set a service with a token', async () => {
    await container.set(PAYMENT_CONFIG, { useValue: { gateway: 'stripe' } });
    await container.set(PAYMENT_TOKEN, PaymentService);
    await container.set(INVOICE_TOKEN, InvoiceService);
    await container.init();

    const invoiceService = await container.get(INVOICE_TOKEN);
    expect(invoiceService.invoice(25)).toMatch(/Paid \$25/);
  });

  it('registers and resolves custom token service', async () => {
    await container.set(PAYMENT_CONFIG, { useValue: { gateway: 'stripe' } });
    await container.set(PaymentService);
    await container.init();

    const paymentService = await container.get(PAYMENT_TOKEN);

    expect(paymentService.pay(50)).toMatch(/Paid \$50/);
  });

  it('injects a service using @Inject decorator', async () => {
    await container.set(PAYMENT_CONFIG, { useValue: { gateway: 'stripe' } });
    await container.set(PaymentService);
    await container.set(InvoiceService);
    await container.init();

    const invoiceService = await container.get(InvoiceService);

    expect(invoiceService.invoice(25)).toMatch(/Paid \$25/);
  });

  it('handles optional injected dependencies (not registered)', async () => {
    await container.set(ProductService);
    await container.set(OrderService);
    await container.init();

    // DEBUG: Print providers map

    console.log(
      'Providers:',
      Array.from((container as any).providers.keys()).map((k) =>
        typeof (k as any) === 'function'
          ? (k as any).name
          : (k as any).toString()
      )
    );

    const orderService = await container.get(OrderService);
    const result = orderService.placeOrder('p1', 100);

    expect(result.amount).toBe(100); // No discount
  });

  it('handles optional injected dependencies (registered)', async () => {
    await container.set(ProductService);
    await container.set(OrderService);
    await container.set({ token: DISCOUNT_TOKEN, useClass: DiscountService });
    await container.init();

    // DEBUG: Print providers map

    console.log(
      'Providers:',
      Array.from((container as any).providers.keys()).map((k) =>
        typeof (k as any) === 'function'
          ? (k as any).name
          : (k as any).toString()
      )
    );

    const orderService = await container.get(OrderService);
    const result = orderService.placeOrder('p1', 100);

    expect(result.amount).toBe(90); // Discount applied
  });

  it('resolve() works for unregistered undecorated service', async () => {
    await container.set(PAYMENT_CONFIG, { useValue: { gateway: 'stripe' } });
    await container.set(PaymentService);
    await container.init();

    class TempService {
      constructor(@Inject(PAYMENT_TOKEN) private payment: PaymentService) {}
      getPayment() {
        return this.payment.pay(42);
      }
    }

    const temp = await container.resolve(TempService);

    expect(temp.getPayment()).toBe('Paid $42 via stripe');
  });

  it('throws when getting unregistered token', async () => {
    await expect(() => container.get(PAYMENT_TOKEN)).rejects.toThrow();
  });
});

// Error/edge-case tests migrated from ecommerce.test.ts

describe('Error handling', () => {
  let container: Nexus;

  beforeEach(() => {
    container = new Nexus();
  });

  it('throws when registering invalid provider', async () => {
    await expect(container.set({})).rejects.toThrow();
  });

  it('throws when factory provider throws', async () => {
    const BAD_FACTORY_TOKEN = new (Token as any)('BadFactoryToken');
    await container.set({
      token: BAD_FACTORY_TOKEN,
      useFactory: () => {
        throw new Error('fail');
      },
    });
    await expect(() => container.get(BAD_FACTORY_TOKEN)).rejects.toThrow();
  });

  it('throws when async value provider rejects', async () => {
    const ASYNC_FAIL_TOKEN = new (Token as any)('AsyncFailToken');
    await container.set({
      token: ASYNC_FAIL_TOKEN,
      useValue: Promise.reject(new Error('fail')),
    });
    await expect(() => container.get(ASYNC_FAIL_TOKEN)).rejects.toThrow();
  });
});
