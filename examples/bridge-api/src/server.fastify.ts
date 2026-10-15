import { createBridge } from './fastify';
import { port, shipFromEnv } from './ship-from-env';

const ship = await shipFromEnv();
const bridge = await createBridge(ship);
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: port() });
process.once('SIGTERM', () => void bridge.close());
