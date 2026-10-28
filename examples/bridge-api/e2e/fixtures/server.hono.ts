import { startHono } from '../../src/entries/start.hono';
import { honoMissionRoutes } from './mission-routes';

// The demo's Hono server with the e2e fixture routes mounted. The console's
// e2e starts it, since one of its cases needs a mission the backend fails.
await startHono(honoMissionRoutes);
