---
sidebar_position: 1
title: 'Real-World Scenarios'
description: 'Explore real-world examples of NexusDI in action. See how to build complete applications with dependency injection.'
tags: ['examples', 'real-world', 'scenarios', 'applications', 'tutorials']
last_updated: '2025-01-27'
version: '1.0.0'
status: 'published'
author: 'NexusDI Team'
---

# 🌍 Real-World Scenarios

Welcome to the real-world examples guide! Just as a Jedi must practice with their lightsaber in real combat situations, you need to see NexusDI in action with complete, practical examples. This guide shows you how to build real applications using dependency injection patterns.

## 🎯 E-Commerce Application

### Complete E-Commerce System

Let's build a full e-commerce application with user management, product catalog, shopping cart, and order processing.

```tsx
import { Nexus, Service, Inject, Module } from 'nexusdi-core';

// Types
interface User {
  id: number;
  email: string;
  name: string;
  role: 'customer' | 'admin';
}

interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
  stock: number;
}

interface CartItem {
  productId: number;
  quantity: number;
}

interface Order {
  id: number;
  userId: number;
  items: CartItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  createdAt: Date;
}

// Database Service
@Service()
class DatabaseService implements AsyncDisposable {
  private connection: DatabaseConnection;

  async connect(config: DatabaseConfig): Promise<void> {
    this.connection = await Database.connect(config);
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.connection.query(sql, params);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// User Repository
@Service()
class UserRepository {
  constructor(@Inject() private db: DatabaseService) {}

  async findById(id: number): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return result[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return result[0] || null;
  }

  async create(userData: Omit<User, 'id'>): Promise<User> {
    const result = await this.db.query<User>(
      'INSERT INTO users (email, name, role) VALUES (?, ?, ?)',
      [userData.email, userData.name, userData.role]
    );
    return { ...userData, id: result[0].id };
  }
}

// Product Repository
@Service()
class ProductRepository {
  constructor(@Inject() private db: DatabaseService) {}

  async findAll(): Promise<Product[]> {
    return await this.db.query<Product>('SELECT * FROM products');
  }

  async findById(id: number): Promise<Product | null> {
    const result = await this.db.query<Product>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    return result[0] || null;
  }

  async updateStock(id: number, quantity: number): Promise<void> {
    await this.db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
      quantity,
      id,
    ]);
  }
}

// Email Service
@Service()
class EmailService {
  constructor(@Inject() private config: EmailConfig) {}

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    console.log(`Sending welcome email to ${name} (${to})`);
    // Implementation would send actual email
  }

  async sendOrderConfirmation(to: string, order: Order): Promise<void> {
    console.log(`Sending order confirmation to ${to} for order ${order.id}`);
    // Implementation would send actual email
  }
}

// Payment Service
@Service()
class PaymentService {
  constructor(@Inject() private config: PaymentConfig) {}

  async processPayment(amount: number, cardToken: string): Promise<string> {
    console.log(`Processing payment of $${amount}`);
    // Implementation would process actual payment
    return `payment_${Date.now()}`;
  }

  async refundPayment(paymentId: string, amount: number): Promise<void> {
    console.log(`Refunding payment ${paymentId} for $${amount}`);
    // Implementation would process actual refund
  }
}

// User Service
@Service()
class UserService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private emailService: EmailService
  ) {}

  async getUser(id: number): Promise<User | null> {
    return await this.userRepo.findById(id);
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    const user = await this.userRepo.create(userData);
    await this.emailService.sendWelcomeEmail(user.email, user.name);
    return user;
  }

  async authenticate(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findByEmail(email);
    if (user && this.verifyPassword(password, user.password)) {
      return user;
    }
    return null;
  }

  private verifyPassword(password: string, hash: string): boolean {
    // Implementation would verify password hash
    return true;
  }
}

// Product Service
@Service()
class ProductService {
  constructor(@Inject() private productRepo: ProductRepository) {}

  async getProducts(): Promise<Product[]> {
    return await this.productRepo.findAll();
  }

  async getProduct(id: number): Promise<Product | null> {
    return await this.productRepo.findById(id);
  }

  async updateStock(id: number, quantity: number): Promise<void> {
    await this.productRepo.updateStock(id, quantity);
  }
}

// Cart Service
@Service()
class CartService {
  private carts = new Map<number, CartItem[]>();

  addItem(userId: number, productId: number, quantity: number): void {
    const cart = this.carts.get(userId) || [];
    const existingItem = cart.find(item => item.productId === productId);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({ productId, quantity });
    }

    this.carts.set(userId, cart);
  }

  getCart(userId: number): CartItem[] {
    return this.carts.get(userId) || [];
  }

  clearCart(userId: number): void {
    this.carts.delete(userId);
  }
}

// Order Service
@Service()
class OrderService {
  constructor(
    @Inject() private userRepo: UserRepository,
    @Inject() private productRepo: ProductRepository,
    @Inject() private paymentService: PaymentService,
    @Inject() private emailService: EmailService,
    @Inject() private cartService: CartService
  ) {}

  async createOrder(userId: number, cardToken: string): Promise<Order> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const cart = this.cartService.getCart(userId);
    if (cart.length === 0) {
      throw new Error('Cart is empty');
    }

    // Calculate total
    let total = 0;
    for (const item of cart) {
      const product = await this.productRepo.findById(item.productId);
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }
      total += product.price * item.quantity;
    }

    // Process payment
    const paymentId = await this.paymentService.processPayment(
      total,
      cardToken
    );

    // Create order
    const order: Order = {
      id: Date.now(),
      userId,
      items: [...cart],
      total,
      status: 'confirmed',
      createdAt: new Date(),
    };

    // Update stock
    for (const item of cart) {
      await this.productRepo.updateStock(item.productId, item.quantity);
    }

    // Clear cart
    this.cartService.clearCart(userId);

    // Send confirmation email
    await this.emailService.sendOrderConfirmation(user.email, order);

    return order;
  }
}

// API Controllers
@Service()
class UserController {
  constructor(@Inject() private userService: UserService) {}

  async handleGetUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const user = await this.userService.getUser(userId);

      if (user) {
        res.json({ success: true, data: user });
      } else {
        res.status(404).json({ success: false, error: 'User not found' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleCreateUser(req: Request, res: Response): Promise<void> {
    try {
      const user = await this.userService.createUser(req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

@Service()
class ProductController {
  constructor(@Inject() private productService: ProductService) {}

  async handleGetProducts(req: Request, res: Response): Promise<void> {
    try {
      const products = await this.productService.getProducts();
      res.json({ success: true, data: products });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

@Service()
class OrderController {
  constructor(@Inject() private orderService: OrderService) {}

  async handleCreateOrder(req: Request, res: Response): Promise<void> {
    try {
      const { userId, cardToken } = req.body;
      const order = await this.orderService.createOrder(userId, cardToken);
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

// Modules
@Module({
  providers: [DatabaseService, UserRepository, ProductRepository],
  exports: [DatabaseService, UserRepository, ProductRepository],
})
class DataModule {}

@Module({
  providers: [EmailService, PaymentService],
  exports: [EmailService, PaymentService],
})
class ExternalServicesModule {}

@Module({
  providers: [UserService, ProductService, CartService, OrderService],
  exports: [UserService, ProductService, CartService, OrderService],
})
class BusinessModule {}

@Module({
  providers: [UserController, ProductController, OrderController],
  exports: [UserController, ProductController, OrderController],
})
class ApiModule {}

// Application Bootstrap
async function bootstrap() {
  const container = new Nexus();
  await container.init();

  // Register configuration
  container.set('databaseConfig', {
    host: 'localhost',
    port: 5432,
    database: 'ecommerce',
  });

  container.set('emailConfig', {
    apiKey: process.env.EMAIL_API_KEY,
    from: 'noreply@ecommerce.com',
  });

  container.set('paymentConfig', {
    apiKey: process.env.PAYMENT_API_KEY,
    environment: 'sandbox',
  });

  // Register modules
  container.set('dataModule', () => new DataModule());
  container.set('externalServicesModule', () => new ExternalServicesModule());
  container.set('businessModule', () => new BusinessModule());
  container.set('apiModule', () => new ApiModule());

  // Initialize database
  const db = await container.get('databaseService');
  await db.connect(container.get('databaseConfig'));

  // Get controllers
  const userController = await container.get('userController');
  const productController = await container.get('productController');
  const orderController = await container.get('orderController');

  // Set up routes (Express.js example)
  app.get('/users/:id', userController.handleGetUser.bind(userController));
  app.post('/users', userController.handleCreateUser.bind(userController));
  app.get(
    '/products',
    productController.handleGetProducts.bind(productController)
  );
  app.post('/orders', orderController.handleCreateOrder.bind(orderController));

  console.log('E-commerce application started!');
}

bootstrap().catch(console.error);
```

## 🏥 Healthcare Management System

### Patient Management System

```tsx
import { Nexus, Service, Inject, Module } from 'nexusdi-core';

// Types
interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  email: string;
  phone: string;
  medicalRecordNumber: string;
}

interface Appointment {
  id: number;
  patientId: number;
  doctorId: number;
  date: Date;
  duration: number;
  type: 'consultation' | 'follow-up' | 'emergency';
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

interface Doctor {
  id: number;
  firstName: string;
  lastName: string;
  specialty: string;
  licenseNumber: string;
  email: string;
}

// Notification Service
@Service()
class NotificationService {
  constructor(@Inject() private config: NotificationConfig) {}

  async sendAppointmentReminder(
    patient: Patient,
    appointment: Appointment
  ): Promise<void> {
    console.log(
      `Sending appointment reminder to ${patient.firstName} ${patient.lastName}`
    );
    // Implementation would send SMS/email
  }

  async sendPrescriptionReady(
    patient: Patient,
    prescription: string
  ): Promise<void> {
    console.log(`Notifying ${patient.firstName} that prescription is ready`);
    // Implementation would send notification
  }
}

// Patient Service
@Service()
class PatientService {
  constructor(
    @Inject() private patientRepo: PatientRepository,
    @Inject() private notificationService: NotificationService
  ) {}

  async getPatient(id: number): Promise<Patient | null> {
    return await this.patientRepo.findById(id);
  }

  async createPatient(patientData: Omit<Patient, 'id'>): Promise<Patient> {
    const patient = await this.patientRepo.create(patientData);
    await this.notificationService.sendWelcomeMessage(patient);
    return patient;
  }

  async updatePatient(id: number, updates: Partial<Patient>): Promise<Patient> {
    return await this.patientRepo.update(id, updates);
  }
}

// Appointment Service
@Service()
class AppointmentService {
  constructor(
    @Inject() private appointmentRepo: AppointmentRepository,
    @Inject() private patientService: PatientService,
    @Inject() private doctorService: DoctorService,
    @Inject() private notificationService: NotificationService
  ) {}

  async scheduleAppointment(
    patientId: number,
    doctorId: number,
    date: Date,
    type: Appointment['type']
  ): Promise<Appointment> {
    const patient = await this.patientService.getPatient(patientId);
    const doctor = await this.doctorService.getDoctor(doctorId);

    if (!patient || !doctor) {
      throw new Error('Patient or doctor not found');
    }

    const appointment = await this.appointmentRepo.create({
      patientId,
      doctorId,
      date,
      duration: 30,
      type,
      status: 'scheduled',
    });

    await this.notificationService.sendAppointmentReminder(
      patient,
      appointment
    );
    return appointment;
  }

  async getAppointmentsByPatient(patientId: number): Promise<Appointment[]> {
    return await this.appointmentRepo.findByPatientId(patientId);
  }

  async getAppointmentsByDoctor(doctorId: number): Promise<Appointment[]> {
    return await this.appointmentRepo.findByDoctorId(doctorId);
  }
}

// Medical Records Service
@Service()
class MedicalRecordsService {
  constructor(@Inject() private recordsRepo: MedicalRecordsRepository) {}

  async addRecord(patientId: number, record: MedicalRecord): Promise<void> {
    await this.recordsRepo.create({ ...record, patientId });
  }

  async getRecords(patientId: number): Promise<MedicalRecord[]> {
    return await this.recordsRepo.findByPatientId(patientId);
  }
}

// Prescription Service
@Service()
class PrescriptionService {
  constructor(
    @Inject() private prescriptionRepo: PrescriptionRepository,
    @Inject() private patientService: PatientService,
    @Inject() private notificationService: NotificationService
  ) {}

  async createPrescription(
    patientId: number,
    medication: string,
    dosage: string,
    instructions: string
  ): Promise<Prescription> {
    const patient = await this.patientService.getPatient(patientId);
    if (!patient) {
      throw new Error('Patient not found');
    }

    const prescription = await this.prescriptionRepo.create({
      patientId,
      medication,
      dosage,
      instructions,
      status: 'pending',
    });

    await this.notificationService.sendPrescriptionReady(patient, medication);
    return prescription;
  }
}

// Healthcare Module
@Module({
  providers: [
    PatientService,
    DoctorService,
    AppointmentService,
    MedicalRecordsService,
    PrescriptionService,
    NotificationService,
  ],
  exports: [
    PatientService,
    DoctorService,
    AppointmentService,
    MedicalRecordsService,
    PrescriptionService,
  ],
})
class HealthcareModule {}
```

## 🏦 Banking System

### Core Banking Operations

```tsx
import { Nexus, Service, Inject, Module } from 'nexusdi-core';

// Types
interface Account {
  id: number;
  accountNumber: string;
  customerId: number;
  balance: number;
  type: 'checking' | 'savings' | 'business';
  status: 'active' | 'frozen' | 'closed';
}

interface Transaction {
  id: number;
  accountId: number;
  type: 'deposit' | 'withdrawal' | 'transfer';
  amount: number;
  description: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}

interface Customer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ssn: string;
  address: Address;
}

// Audit Service
@Service()
class AuditService {
  constructor(@Inject() private auditRepo: AuditRepository) {}

  async logTransaction(transaction: Transaction): Promise<void> {
    await this.auditRepo.create({
      entityType: 'transaction',
      entityId: transaction.id,
      action: 'created',
      timestamp: new Date(),
      data: transaction,
    });
  }

  async logAccountChange(
    account: Account,
    changes: Partial<Account>
  ): Promise<void> {
    await this.auditRepo.create({
      entityType: 'account',
      entityId: account.id,
      action: 'updated',
      timestamp: new Date(),
      data: { before: account, after: changes },
    });
  }
}

// Account Service
@Service()
class AccountService {
  constructor(
    @Inject() private accountRepo: AccountRepository,
    @Inject() private transactionRepo: TransactionRepository,
    @Inject() private auditService: AuditService
  ) {}

  async createAccount(
    customerId: number,
    type: Account['type']
  ): Promise<Account> {
    const accountNumber = this.generateAccountNumber();
    const account = await this.accountRepo.create({
      accountNumber,
      customerId,
      balance: 0,
      type,
      status: 'active',
    });

    await this.auditService.logAccountChange(account, {});
    return account;
  }

  async getAccount(accountId: number): Promise<Account | null> {
    return await this.accountRepo.findById(accountId);
  }

  async getAccountByNumber(accountNumber: string): Promise<Account | null> {
    return await this.accountRepo.findByAccountNumber(accountNumber);
  }

  private generateAccountNumber(): string {
    return Math.random().toString().slice(2, 12);
  }
}

// Transaction Service
@Service()
class TransactionService {
  constructor(
    @Inject() private transactionRepo: TransactionRepository,
    @Inject() private accountService: AccountService,
    @Inject() private auditService: AuditService
  ) {}

  async deposit(
    accountId: number,
    amount: number,
    description: string
  ): Promise<Transaction> {
    const account = await this.accountService.getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    if (account.status !== 'active') {
      throw new Error('Account is not active');
    }

    const transaction = await this.transactionRepo.create({
      accountId,
      type: 'deposit',
      amount,
      description,
      timestamp: new Date(),
      status: 'completed',
    });

    await this.accountService.updateBalance(
      accountId,
      account.balance + amount
    );
    await this.auditService.logTransaction(transaction);

    return transaction;
  }

  async withdraw(
    accountId: number,
    amount: number,
    description: string
  ): Promise<Transaction> {
    const account = await this.accountService.getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    if (account.status !== 'active') {
      throw new Error('Account is not active');
    }

    if (account.balance < amount) {
      throw new Error('Insufficient funds');
    }

    const transaction = await this.transactionRepo.create({
      accountId,
      type: 'withdrawal',
      amount,
      description,
      timestamp: new Date(),
      status: 'completed',
    });

    await this.accountService.updateBalance(
      accountId,
      account.balance - amount
    );
    await this.auditService.logTransaction(transaction);

    return transaction;
  }

  async transfer(
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    description: string
  ): Promise<Transaction[]> {
    const fromAccount = await this.accountService.getAccount(fromAccountId);
    const toAccount = await this.accountService.getAccount(toAccountId);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    if (fromAccount.balance < amount) {
      throw new Error('Insufficient funds');
    }

    // Create withdrawal transaction
    const withdrawal = await this.transactionRepo.create({
      accountId: fromAccountId,
      type: 'withdrawal',
      amount,
      description: `Transfer to ${toAccount.accountNumber}`,
      timestamp: new Date(),
      status: 'completed',
    });

    // Create deposit transaction
    const deposit = await this.transactionRepo.create({
      accountId: toAccountId,
      type: 'deposit',
      amount,
      description: `Transfer from ${fromAccount.accountNumber}`,
      timestamp: new Date(),
      status: 'completed',
    });

    // Update balances
    await this.accountService.updateBalance(
      fromAccountId,
      fromAccount.balance - amount
    );
    await this.accountService.updateBalance(
      toAccountId,
      toAccount.balance + amount
    );

    // Log transactions
    await this.auditService.logTransaction(withdrawal);
    await this.auditService.logTransaction(deposit);

    return [withdrawal, deposit];
  }
}

// Banking Module
@Module({
  providers: [
    AccountService,
    TransactionService,
    CustomerService,
    AuditService,
  ],
  exports: [AccountService, TransactionService, CustomerService],
})
class BankingModule {}
```

## 🎯 Key Patterns Demonstrated

### 1. Service Layer Pattern

- Business logic separated from data access
- Services handle complex operations
- Clear separation of concerns

### 2. Repository Pattern

- Data access abstracted from business logic
- Easy to mock for testing
- Database-agnostic implementation

### 3. Module Organization

- Related services grouped together
- Clear dependencies and exports
- Reusable across applications

### 4. Dependency Injection

- Services depend on abstractions
- Easy to test and mock
- Flexible configuration

### 5. Error Handling

- Consistent error handling patterns
- Proper error propagation
- User-friendly error messages

## 🚀 Next Steps

Ready to build your own real-world application?

- **[Getting Started](/docs/getting-started)** - Learn the basics
- **[Core Concepts](/docs/concepts)** - Understand dependency injection
- **[Best Practices](/docs/best-practices)** - Follow proven patterns
- **[API Reference](/docs/api-reference)** - Explore the full API

---

**Need help with your real-world application?** Check out [Best Practices](/docs/best-practices) to learn proven patterns! 🚀
