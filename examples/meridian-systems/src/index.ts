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
export {
  COMMS_ARRAY,
  COMMS_OPTIONS,
  type CommsMessage,
  type CommsOptions,
  type CommsRecord,
  type CommsSetpoints,
  type CommsStatus,
  type ICommsArray,
  type ISubspaceLink,
  SUBSPACE_LINK,
} from './systems/comms/contracts';

// Engineering.
export {
  type CoolantRating,
  type CoolantRecord,
  type IPowerConsumer,
  type IPowerRouter,
  type IReactorCore,
  type IShieldGrid,
  type LoadRecord,
  POWER_CONSUMERS,
  POWER_ROUTER,
  type PowerLoad,
  type PowerRecord,
  type ReactorRating,
  type ReactorRecord,
  REACTOR,
  SHIELD_GRID,
} from './systems/engineering/contracts';

// The FTL drive, which a running ship adds with load(), and its contract.
export {
  FTL_DRIVE,
  type FtlRating,
  type FtlRecord,
  type FtlSetpoints,
  type FtlStatus,
  type IFtlDrive,
} from './systems/ftl/contracts';
export { FtlDrive } from './systems/ftl/ftl-drive.module';

// Helm.
export {
  type HelmRecord,
  type HelmSetpoints,
  HELM,
  type IHelm,
  type IThrusters,
  THRUSTERS,
} from './systems/helm/contracts';

// Propulsion.
export {
  type DriveRecord,
  type DriveSetpoints,
  type IMainDrive,
  MAIN_DRIVE,
} from './systems/propulsion/contracts';

// Life support.
export {
  ATMOSPHERE_CONTROL,
  ATMOSPHERE_PROBE,
  ATMOSPHERE_SENSOR,
  type AtmosphereReading,
  type HeaterSetpoint,
  type IAtmosphereControl,
  type IAtmosphereProbe,
  type IAtmosphereSensor,
  LIFE_SUPPORT_OPTIONS,
  type LifeSupportOptions,
  type LifeSupportRecord,
  type LifeSupportSetpoints,
  type PumpMode,
} from './systems/life-support/contracts';

// Safety.
export {
  type Alarm,
  type AlarmCode,
  ALARM_SINKS,
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  type IAlarmSink,
  type IBlastDoors,
  type IFireSuppression,
  type IMasterAlarm,
  MASTER_ALARM,
  type SafetyRecord,
  type SafetySetpoints,
} from './systems/safety/contracts';

// Tactical.
export {
  type Course,
  type INavCharts,
  NAV_CHARTS,
} from './systems/tactical/contracts';

// Weapons.
export {
  type IWeaponMount,
  type RailgunRating,
  type RailgunShot,
  WEAPON_MOUNT,
  type WeaponsRecord,
  type WeaponsSetpoints,
  type WeaponsStatus,
} from './systems/weapons/contracts';
