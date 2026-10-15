// The request every test in this package maps: a shuttle's mission. Required,
// so the type tests can check that nexus() then requires the `request`
// option.
declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: { id: string; target: string };
  }
}

export {};
