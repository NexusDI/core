// An object root with a key core does not know, which it refuses before it
// compiles (NEXUS_INVALID_MODULE).
export const NotAModule = { providers: [], imports: [], wiring: true };
