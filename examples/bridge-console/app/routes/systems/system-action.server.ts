/**
 * The action every ship system page under /systems and the airlock panel
 * share: it reads the posted form as one command for the page's system, or
 * for the system its record names for the posted action, and posts it to
 * bridge-api. React Router drops each route's action from the client bundle,
 * and the `.server` suffix fails the client build if client code imports
 * this module and, through it, nexus.server.
 */
import type { ShipCommand } from '@nexusdi/meridian-systems';
import type { ActionFunctionArgs } from 'react-router';

import {
  BRIDGE_LINK,
  type CommandAnswer,
  type IBridgeLink,
} from '../../bridge/bridge-link';
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
 * The system of the commands a page posts: one system name, or a record that
 * names the system of each action the page posts.
 */
export type SystemOf = string | Readonly<Record<string, string>>;

/**
 * The ship command a system page's form posts. The form's `command` field
 * names the action, and `args` names each field the action reads and its
 * kind. A record `system` names the system of each action, and an action
 * outside the record gets an empty system, which the backend refuses with
 * `MERIDIAN_BAD_COMMAND`. A missing, blank or file field stays out, and so
 * does a boolean field other than true or false. The backend refuses a number
 * field that is not a number, and checks the action and its arguments, so a
 * bad command comes back as a refusal.
 */
export function commandFrom(
  form: FormData,
  system: SystemOf,
  args: Readonly<Record<string, ArgumentKind>>,
): ShipCommand {
  const fields: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(args)) {
    const value = argument(form.get(name), kind);
    if (value !== undefined) fields[name] = value;
  }
  const action = String(form.get('command') ?? '');
  const named =
    typeof system === 'string'
      ? system
      : Object.hasOwn(system, action)
        ? (system[action] ?? '')
        : '';
  return { system: named, action, ...fields };
}

/**
 * A route action that reads the submitted form, hands it to `post` with the
 * request's bridge link, and answers what the link answers.
 */
function linkAction(
  post: (link: IBridgeLink, form: FormData) => Promise<CommandAnswer>,
): (args: ActionFunctionArgs) => Promise<CommandAnswer> {
  return di.inject(
    { link: BRIDGE_LINK },
    async ({ link }, { request }: ActionFunctionArgs) =>
      post(link, await request.formData()),
  );
}

/**
 * A route action that posts the submitted form to bridge-api as a command
 * for `system` (one name, or the system of each action), read by
 * `commandFrom` with `args`. It answers the queued tick or the backend's
 * refusal.
 */
export function systemAction(
  system: SystemOf,
  args: Readonly<Record<string, ArgumentKind>>,
): (args: ActionFunctionArgs) => Promise<CommandAnswer> {
  return linkAction((link, form) =>
    link.command(commandFrom(form, system, args)),
  );
}

/**
 * A route action for the FTL page: the form's `command` is `spool` or `jump`,
 * and a jump reads the star from the `to` field. The FTL routes sit outside
 * `POST /commands`, so the action calls the link's own posts. Any other
 * command goes to `POST /commands` and comes back as the backend's refusal.
 */
export function ftlAction(): (
  args: ActionFunctionArgs,
) => Promise<CommandAnswer> {
  return linkAction((link, form) => {
    const command = String(form.get('command') ?? '');
    if (command === 'spool') return link.spool();
    if (command === 'jump') return link.jump(String(form.get('to') ?? ''));
    return link.command(commandFrom(form, 'ftl', {}));
  });
}
