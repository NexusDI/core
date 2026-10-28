import type { Mission } from '../ship/contracts';

/** The request header that names the mission. */
export const MISSION_HEADER = 'x-mission-id';

/** The mission a request without the header flies. */
const DEFAULT_MISSION: Mission = { id: 'survey-7', target: 'Kepler-442b' };

/** A header as a framework hands it over: Node types a repeated header as a list. */
type Header = string | readonly string[] | undefined;

/**
 * The mission of a request: the target is always Kepler-442b, and the id is
 * the `x-mission-id` header, or `survey-7` without one. The bridge entries
 * and the console build their `NexusRequest` from this.
 */
export const missionOf = (header: Header): Mission => ({
  ...DEFAULT_MISSION,
  id:
    typeof header === 'string'
      ? header
      : (header?.join(', ') ?? DEFAULT_MISSION.id),
});

/**
 * The request the bridge entries hand `nexus()`: the mission and, when the
 * path names one, the compartment.
 */
export const requestOf = (header: Header, compartment: string | undefined) => ({
  mission: missionOf(header),
  ...(compartment === undefined ? {} : { compartment }),
});
