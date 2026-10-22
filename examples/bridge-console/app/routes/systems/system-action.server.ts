/**
 * The action every ship system page under /systems shares: it reads the
 * posted form as one command for the page's system and posts it to
 * bridge-api. React Router drops each route's action from the client bundle,
 * and the `.server` suffix fails the client build if client code imports
 * this module and, through it, nexus.server.
 */
import type { ShipCommand } from '@nexusdi/meridian-systems';
import type { ActionFunctionArgs } from 'react-router';

import { BRIDGE_LINK, type CommandAnswer } from '../../bridge/bridge-link';
import { di } from '../../nexus.server';

/**
 * How `commandFrom` reads one form field: as the string itself, as a number,
 * or as `true` for "true" and `false` for "false".
 */
export type ArgumentKind = 'text' | 'number' | 'boolean';

/**
 * The command argument `kind` reads from `value`, or undefined for a missing,
 * blank or file field and for a boolean field other than true or false.
 */
function argument(value: FormDataEntryValue | null, kind: ArgumentKind) {
  if (typeof value !== 'string' || value === '') return undefined;
  if (kind === 'number') return Number(value);
  if (kind === 'boolean')
    return value === 'true' || value === 'false' ? value === 'true' : undefined;
  return value;
}

/**
 * The ship command a system page's form posts. The form's `command` field
 * names the action, and `args` names each field the action reads and its
 * kind. A missing, blank or file field stays out, and so does a boolean
 * field other than true or false. The backend refuses a number field that is
 * not a number, and checks the action and its arguments, so a bad command
 * comes back as a refusal.
 */
export function commandFrom(
  form: FormData,
  system: string,
  args: Readonly<Record<string, ArgumentKind>>,
): ShipCommand {
  const fields: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(args)) {
    const value = argument(form.get(name), kind);
    if (value !== undefined) fields[name] = value;
  }
  return { system, action: String(form.get('command') ?? ''), ...fields };
}

/**
 * A route action that posts the submitted form to bridge-api as a command
 * for `system`, read by `commandFrom` with `args`. It answers the queued
 * tick or the backend's refusal.
 */
export function systemAction(
  system: string,
  args: Readonly<Record<string, ArgumentKind>>,
): (args: ActionFunctionArgs) => Promise<CommandAnswer> {
  return di.inject(
    { link: BRIDGE_LINK },
    async ({ link }, { request }: ActionFunctionArgs) =>
      link.command(commandFrom(await request.formData(), system, args)),
  );
}
