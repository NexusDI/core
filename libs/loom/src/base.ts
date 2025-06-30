import type { Lifecycle } from './types.js';

/**
 * Base class for providers that want lifecycle management
 */
export abstract class Provider implements Lifecycle {
  /**
   * Called when the provider is started
   */
  async onStart(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when the provider is stopped
   */
  async onStop(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when the provider is disposed
   */
  async onDispose(): Promise<void> {
    // Override in subclasses
  }
}

/**
 * Base class for modules
 */
export abstract class BaseModule implements Lifecycle {
  /**
   * Called when the module is started
   */
  async onStart(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when the module is stopped
   */
  async onStop(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Called when the module is disposed
   */
  async onDispose(): Promise<void> {
    // Override in subclasses
  }
}
