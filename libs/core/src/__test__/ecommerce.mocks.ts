import { DynamicModuleConfig } from 'src/types';
import {
  Service,
  Inject,
  Optional,
  Token,
  Module,
  type DynamicModule,
  createModuleConfig,
} from '../index';

export interface PaymentConfig {
  gateway: string;
}

// --- TOKENS ---
export const PAYMENT_TOKEN = new Token<PaymentService>('PaymentService');
export const PAYMENT_CONFIG = new Token<PaymentConfig>('PaymentConfig');
export const CURRENCY_SYMBOL = new Token<string>('CurrencySymbol');
export const EXCHANGE_RATE = new Token<Promise<number>>('ExchangeRate');
export const ORDER_ID_FACTORY = new Token<() => string>('OrderIdFactory');
export const TAX_RATE_FACTORY = new Token<() => Promise<number>>(
  'TaxRateFactory'
);
export const INVOICE_TOKEN = new Token<InvoiceService>('InvoiceService');
export const INVENTORY_TOKEN = new Token<InventoryService>('InventoryService');
export const DISCOUNT_TOKEN = new Token<DiscountService>('DiscountService');
export const ORDER_SUMMARY_FACTORY = new Token<
  (amount: number) => Promise<string>
>('OrderSummaryFactory');

// --- SERVICES ---
// Undecorated class-based service
export class InventoryService {
  getStock(productId: string) {
    if (productId === '42') return 42;
    return 100;
  }
}

// Decorated class-based service (default token)
@Service()
export class UserService {
  getUser(id: string) {
    return { id, name: 'Alice' };
  }
}

/* Custom token service
 * This service should be registerd in the container with the class as reference.
 * But called from the container with the token as reference.
 * This is to validate that the container can resolve the service with the token.
 */
@Service(PAYMENT_TOKEN)
export class PaymentService {
  constructor(@Inject(PAYMENT_CONFIG) private config: PaymentConfig) {}

  pay(amount: number) {
    return `Paid $${amount} via ${this.config.gateway}`;
  }
}

/* Service with @Inject for custom token
 * This service should be registered in the container with the `INVOICE_TOKEN` as reference.
 * And injected with the `PAYMENT_TOKEN` as reference.
 * This is to validate that the container can resolve the service with the token,
 * without the need to register the token in the `@Service` decorator.
 */
@Service()
export class InvoiceService {
  constructor(@Inject(PAYMENT_TOKEN) public payment: PaymentService) {}
  invoice(amount: number) {
    return this.payment.pay(amount);
  }
}

@Service()
export class ProductService {
  getProduct(id: string) {
    return { id, name: 'Product' };
  }
}

// Service with optional dependency
@Service()
export class OrderService {
  constructor(
    //@Inject(DISCOUNT_TOKEN) public discountService: DiscountService,
    @Inject(ProductService) public productService: ProductService,
    @Optional(DISCOUNT_TOKEN) public discountService?: DiscountService
  ) {}
  placeOrder(productId: string, amount: number) {
    const product = this.productService.getProduct(productId);
    const discount = this.discountService?.getDiscount(productId) ?? 0;
    return { product, amount: amount - discount };
  }
}

export class DiscountService {
  getDiscount(userId: string) {
    if (userId === '42') return 100;
    return 10;
  }
}

// --- PROVIDERS ---
export const currencyValueProvider = '$';
export const exchangeRateValueProvider = Promise.resolve(1.1);
export const orderIdFactoryProvider = {
  token: ORDER_ID_FACTORY,
  useValue: () => Math.random().toString(36).slice(2),
};
export const taxRateFactoryProvider = {
  token: TAX_RATE_FACTORY,
  useValue: async () => 0.2,
};

// Factory provider that depends on CURRENCY_SYMBOL and EXCHANGE_RATE
export const orderSummaryFactoryProvider = {
  token: ORDER_SUMMARY_FACTORY,
  useFactory: async (currency: string, rate: number) => {
    return async (amount: number) => {
      const converted = amount * rate;
      return `Order total: ${currency}${converted.toFixed(2)}`;
    };
  },
  deps: [CURRENCY_SYMBOL, EXCHANGE_RATE],
};

// --- MODULES ---
@Module({
  providers: [UserService, InventoryService],
})
export class CoreModule {}

@Module({
  providers: [PaymentService],
})
export class PaymentModule implements DynamicModule<PaymentConfig> {
  readonly configToken = PAYMENT_CONFIG;
  static config(config: DynamicModuleConfig<PaymentConfig>) {
    return createModuleConfig(PaymentModule, config);
  }
}

// --- SHIPPING MODULE ---
export class ShippingService {
  ship(orderId: string) {
    return `Shipped order ${orderId}`;
  }
}

@Module({
  providers: [ShippingService],
})
export class ShippingModule {}

// --- ORDER MODULE ---
@Module({
  imports: [ShippingModule],
  providers: [OrderService],
})
export class OrderModule {}
