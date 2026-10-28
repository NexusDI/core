// Errors.
export {
  BadCommandError,
  FtlNotSpooledError,
  InterlockError,
  PowerBudgetError,
  RelayError,
  UnknownCompartmentError,
  type BadArgumentProblem,
  type BadCommandReason,
  type RelayFaultReason,
} from './errors';

// The ship module and its options.
export {
  meridianSystems,
  type MeridianSystemsOptions,
} from './meridian-systems.module';

// The graph annotator that labels each provider with its system and phase.
export { shipNotes } from './notes';

// Simulation: the tick loop, the ship state and the command desk.
export {
  COMMAND_DESK,
  COMMAND_HANDLERS,
  type DeepPartial,
  type ICommandDesk,
  type ICommandHandler,
  type LoggedChange,
  type QueuedCommand,
  type SetpointChange,
  type Setpoints,
  type ShipCommand,
} from './simulation/commands';
export {
  COMPARTMENT,
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentPlan,
  type CompartmentReading,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type DoorId,
  DOOR_IDS,
  type DoorPlan,
  type IRandomSource,
  type ISimClock,
  type IShipState,
  type IShipSystem,
  type ITickLoop,
  type Phase,
  PHASES,
  RNG,
  SHIP_STATE,
  SHIP_SYSTEMS,
  SIM_CLOCK,
  SIM_OPTIONS,
  type ShipReading,
  type ShipSnapshot,
  type ShipSystemClass,
  type SimOptions,
  TICK_LOOP,
  type TickContext,
  type TickListener,
} from './simulation/contracts';
export { readShip } from './simulation/read-ship';
export { roundSnapshot } from './simulation/round-snapshot';

// Telemetry.
export {
  type ITelemetryFeed,
  TELEMETRY,
  type TelemetrySink,
} from './telemetry/contracts';

// Gases and door pressures, which the safety and life-support laws share.
export { doorPressures, PRESSURE_INTERLOCK } from './physics/doors';
export { GASES, pressure, type Gas } from './physics/gas';

// Comms.
export type {
  CommsMessage,
  CommsRecord,
  CommsSetpoints,
  CommsStatus,
} from './physics/comms';
export {
  COMMS_ARRAY,
  COMMS_OPTIONS,
  type CommsOptions,
  type ICommsArray,
  type ISubspaceLink,
  SUBSPACE_LINK,
} from './systems/comms/contracts';

// Engineering.
export type { LoadRecord, PowerLoad, PowerRecord } from './physics/power';
export type {
  CoolantRating,
  CoolantRecord,
  ReactorRating,
  ReactorRecord,
} from './physics/thermal';
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

// The FTL drive, which a running ship adds with load(), and its contract.
export type {
  FtlRating,
  FtlRecord,
  FtlSetpoints,
  FtlStatus,
} from './physics/ftl';
export { FTL_DRIVE, type IFtlDrive } from './systems/ftl/contracts';
export { FtlDrive } from './systems/ftl/ftl-drive.module';

// Helm and propulsion.
export type {
  DriveRecord,
  DriveSetpoints,
  HelmRecord,
  HelmSetpoints,
} from './physics/motion';
export {
  HELM,
  type IHelm,
  type IThrusters,
  THRUSTERS,
} from './systems/helm/contracts';
export { type IMainDrive, MAIN_DRIVE } from './systems/propulsion/contracts';

// Life support.
export type {
  AtmosphereReading,
  HeaterSetpoint,
  LifeSupportRecord,
  LifeSupportSetpoints,
  PumpMode,
} from './physics/atmosphere';
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

// Safety.
export type {
  Alarm,
  AlarmCode,
  SafetyRecord,
  SafetySetpoints,
} from './physics/safety';
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

// Tactical.
export {
  type Course,
  type INavCharts,
  NAV_CHARTS,
} from './systems/tactical/contracts';

// Weapons.
export type {
  RailgunRating,
  RailgunShot,
  WeaponsRecord,
  WeaponsSetpoints,
  WeaponsStatus,
} from './physics/weapons';
export { type IWeaponMount, WEAPON_MOUNT } from './systems/weapons/contracts';
