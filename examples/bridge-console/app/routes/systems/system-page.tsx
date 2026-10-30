/**
 * The components every ship system page under /systems and the airlock panel
 * share: its gauge lists, its headed control sections and the answer to its
 * last command. A new system page builds its gauges and forms from these,
 * and its action from `systemAction` in system-action.server.ts.
 */
import type { ReactNode } from 'react';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import { Button, Section } from '../../components';
import type { CommandAnswer } from '../../di/contracts';
import { type AnswerBand, useShipCommand } from '../../hooks/use-ship-command';
import { useShipReading } from '../../hooks/use-ship-reading';

/** A list of named gauges, each a name and its rounded value, with `label` as its accessible name. */
export function Gauges({
  label,
  gauges,
}: {
  label: string;
  gauges: readonly (readonly [name: string, value: string])[];
}) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-1">
      {gauges.map(([name, value]) => (
        <div key={name} className="contents">
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A list of text lines with `label` as its accessible name, or the paragraph
 * `none` when `items` is empty.
 */
export function ItemList({
  label,
  none,
  items,
}: {
  label: string;
  none: string;
  items: readonly string[];
}) {
  if (items.length === 0) return <p>{none}</p>;
  return (
    <ul aria-label={label}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** The section a page shows in place of its gauges when the ship snapshot fails, and as its route's error boundary. */
export function SnapshotOffline() {
  return (
    <Section>
      <p>Ship snapshot offline</p>
    </Section>
  );
}

/** The error boundary of every system route, rendered inside the layout's outlet. */
export function SystemErrorBoundary() {
  return <SnapshotOffline />;
}

/** A section of the page's controls under a level-two heading `title`. */
export function ControlSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Section>
      <h2 className="text-2xl font-semibold mb-4 dark:text-white">{title}</h2>
      {children}
    </Section>
  );
}

/** A tick with its thousands grouped, as every page shows ticks. */
const tick = (value: number) => value.toLocaleString('en-US');

/**
 * The band for the last command: the tick it queues for, and once a reading
 * reaches that tick the tick it applied at, with one line per flight-log
 * entry and the system's notice and fix. A refusal shows its code, its
 * message and its fix.
 */
function LastAnswer({ band }: { band: AnswerBand }) {
  if (band.state === 'refused')
    return (
      <div role="alert">
        <p>{`${band.code}: ${band.message}`}</p>
        {band.fix === undefined ? null : <p>{`Fix: ${band.fix}`}</p>}
      </div>
    );
  const queued = `Queued for tick ${tick(band.tick)}.`;
  return (
    <div role="status">
      <p>
        {band.state === 'applied'
          ? `${queued} Applied at tick ${tick(band.appliedAt)}.`
          : queued}
      </p>
      {band.notice === undefined ? null : (
        <>
          <p>{band.notice.message}</p>
          {band.notice.fix === undefined ? null : (
            <p>{`Fix: ${band.notice.fix}`}</p>
          )}
        </>
      )}
      {band.flightLog === undefined ? null : (
        <ul>
          {band.flightLog.map((entry, index) => (
            <li key={index}>{entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A system page: its gauges and controls in `children`, then the band for
 * the last command once the action returns one. `answer` is the route's
 * `actionData`, undefined until the reader posts a form. `ship` is the live
 * reading, null while the stream is offline, and turns the band to applied.
 */
export function SystemPage({
  answer,
  ship,
  children,
}: {
  answer: CommandAnswer | undefined;
  ship: ShipReading | null;
  children: ReactNode;
}) {
  const band = useShipCommand(answer, ship);
  return (
    <>
      {children}
      {band === undefined ? null : (
        <Section>
          <LastAnswer band={band} />
        </Section>
      )}
    </>
  );
}

/**
 * A system page over the live reading of `snapshot`, the loader's data: the
 * `gauges` of the reading, or the snapshot-offline section while the reading
 * is null, then the page's controls in `children` and the band for the last
 * command. `children` may be a function of the reading for controls that
 * list its rooms or doors. `answer` is the route's `actionData`.
 */
export function LiveSystemPage({
  snapshot,
  answer,
  gauges,
  children,
}: {
  snapshot: ShipReading | null;
  answer: CommandAnswer | undefined;
  gauges: (ship: ShipReading) => ReactNode;
  children: ReactNode | ((ship: ShipReading | null) => ReactNode);
}) {
  const ship = useShipReading(snapshot);
  return (
    <SystemPage answer={answer} ship={ship}>
      {ship === null ? <SnapshotOffline /> : gauges(ship)}
      {typeof children === 'function' ? children(ship) : children}
    </SystemPage>
  );
}

/**
 * A form of a select named `id` that lists `options`, with one button for
 * each of two commands. The first command is the primary button.
 */
export function CommandSelect({
  id,
  label,
  options,
  commands,
}: {
  id: string;
  label: string;
  options: readonly string[];
  commands: readonly [
    readonly [value: string, text: string],
    readonly [value: string, text: string],
  ];
}) {
  const [[first, firstText], [second, secondText]] = commands;
  return (
    <Form method="post" className="flex gap-2 items-center">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} defaultValue={options[0]}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Button type="submit" name="command" value={first}>
        {firstText}
      </Button>
      <Button type="submit" name="command" value={second} variant="outline">
        {secondText}
      </Button>
    </Form>
  );
}

/**
 * A form of one number named `name` that posts `command` with the number when
 * the reader presses `button`. `label` names the field and `defaultValue`
 * fills it. `min`, `max` and `step` bound it. `hidden` posts more fields with
 * the number, such as the compartment a heater belongs to. The field's id is
 * `name`, so a page holds one `NumberForm` for each field name.
 */
export function NumberForm({
  command,
  name,
  label,
  button,
  min,
  max,
  step,
  defaultValue,
  hidden = {},
}: {
  command: string;
  name: string;
  label: string;
  button: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  hidden?: Readonly<Record<string, string>>;
}) {
  return (
    <Form method="post" className="flex gap-2 items-center">
      <input type="hidden" name="command" value={command} />
      {Object.entries(hidden).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        required
      />
      <Button type="submit">{button}</Button>
    </Form>
  );
}

/**
 * A form of two buttons that post `command` with the field `field` set to
 * true for the first button, `on`, and to false for the second, `off`.
 * `hidden` posts more fields with either button, such as the compartment a
 * vent belongs to.
 */
export function ToggleForm({
  command,
  field,
  on,
  off,
  hidden = {},
}: {
  command: string;
  field: string;
  on: string;
  off: string;
  hidden?: Readonly<Record<string, string>>;
}) {
  return (
    <Form method="post" className="flex gap-2">
      <input type="hidden" name="command" value={command} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" name={field} value="true">
        {on}
      </Button>
      <Button type="submit" name={field} value="false" variant="outline">
        {off}
      </Button>
    </Form>
  );
}

/**
 * A `NumberForm` of one number named `level`, from 0 to 1 in steps of 0.01.
 * The field's id is `level`, so a page holds one `LevelForm`.
 */
export function LevelForm(props: {
  command: string;
  label: string;
  button: string;
  defaultValue: number;
}) {
  return <NumberForm {...props} name="level" min={0} max={1} step={0.01} />;
}
