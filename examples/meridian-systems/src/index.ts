export {
  BadCommandError,
  InterlockError,
  PowerBudgetError,
  UnknownCompartmentError,
  type BadCommandReason,
} from './errors';
export {
  meridianSystems,
  type MeridianSystemsOptions,
} from './meridian-systems.module';
export type {
  AtmosphereReading,
  HeaterSetpoint,
  LifeSupportRecord,
  LifeSupportSetpoints,
  PumpMode,
} from './physics/atmosphere';
export type {
  CommsMessage,
  CommsRecord,
  CommsSetpoints,
  CommsStatus,
} from './physics/comms';
export { doorPressures, PRESSURE_INTERLOCK } from './physics/doors';
export { GASES, pressure, type Gas } from './physics/gas';
export type { LoadRecord, PowerLoad, PowerRecord } from './physics/power';
export type {
  Alarm,
  AlarmCode,
  SafetyRecord,
  SafetySetpoints,
} from './physics/safety';
export type {
  CoolantRating,
  CoolantRecord,
  ReactorRating,
  ReactorRecord,
} from './physics/thermal';
export * from './simulation/commands';
export * from './simulation/contracts';
export { readShip } from './simulation/read-ship';
export { roundSnapshot } from './simulation/round-snapshot';
export * from './telemetry/contracts';
export { shipNotes } from './notes';
export {
  COMMS_ARRAY,
  COMMS_OPTIONS,
  type CommsOptions,
  type ICommsArray,
  type ISubspaceLink,
  SUBSPACE_LINK,
} from './systems/comms/contracts';
export {
  type IPowerConsumer,
  type IPowerRouter,
  type IReactorCore,
  type IShieldGrid,
  POWER_CONSUMERS,
  POWER_ROUTER,
  REACTOR,
  SHIELD_GRID,
} from './systems/engineering/contracts';
export {
  ATMOSPHERE_CONTROL,
  ATMOSPHERE_PROBE,
  ATMOSPHERE_SENSOR,
  type IAtmosphereControl,
  type IAtmosphereProbe,
  type IAtmosphereSensor,
  LIFE_SUPPORT_OPTIONS,
  type LifeSupportOptions,
} from './systems/life-support/contracts';
export {
  ALARM_SINKS,
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  type IAlarmSink,
  type IBlastDoors,
  type IFireSuppression,
  type IMasterAlarm,
  MASTER_ALARM,
} from './systems/safety/contracts';
export {
  type Course,
  type INavCharts,
  NAV_CHARTS,
} from './systems/tactical/contracts';
export { BUNDLED_CHARTS } from './systems/tactical/star-charts';
