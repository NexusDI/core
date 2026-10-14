// The request every test in this package maps: a shuttle's mission. Optional,
// so the adapter's `request` option stays optional, as it is for an app that
// declares no required field.
declare module '@nexusdi/core' {
  interface NexusRequest {
    mission?: { id: string; target: string };
  }
}

export {};
