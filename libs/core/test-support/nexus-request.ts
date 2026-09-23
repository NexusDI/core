// The container's tests pass `createScope({ request: { mission } })`. This is
// the augmentation an application writes, declared once for every test file.
declare module '../src/index.js' {
  interface NexusRequest {
    mission?: string;
  }
}

export {};
