/**
 * The components every ship system page under /systems and the airlock panel
 * share: its gauge lists, its headed control sections and the answer to its
 * last command. A new system page builds its gauges and forms from these,
 * and its action from `systemAction` in system-action.server.ts.
 */
import type { ReactNode } from 'react';
import { Form } from 'react-router';

import type { CommandAnswer } from '../../bridge/bridge-link';
import { Button, Section } from '../../components';

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

/** The section a page shows in place of its gauges when the ship snapshot fails. */
export function SnapshotOffline() {
  return (
    <Section>
      <p>Ship snapshot offline</p>
    </Section>
  );
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

/**
 * The answer to the last command: its tick and one line per flight-log entry
 * the command recorded, or the refusal and its fix.
 */
function LastAnswer({ answer }: { answer: CommandAnswer }) {
  if (answer.accepted)
    return (
      <div role="status">
        <p>{`Queued for tick ${answer.tick}`}</p>
        {answer.flightLog === undefined ? null : (
          <ul>
            {answer.flightLog.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )}
      </div>
    );
  return (
    <div role="alert">
      <p>{answer.message}</p>
      {answer.fix === undefined ? null : <p>{`Fix: ${answer.fix}`}</p>}
    </div>
  );
}

/**
 * A system page: its gauges and controls in `children`, then the answer to
 * the last command once the action returns one. `answer` is the route's
 * `actionData`, undefined until the reader posts a form.
 */
export function SystemPage({
  answer,
  children,
}: {
  answer: CommandAnswer | undefined;
  children: ReactNode;
}) {
  return (
    <>
      {children}
      {answer === undefined ? null : (
        <Section>
          <LastAnswer answer={answer} />
        </Section>
      )}
    </>
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
 * fills it. `min`, `max` and `step` bound it. The field's id is `name`, so a
 * page holds one `NumberForm` for each field name.
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
}: {
  command: string;
  name: string;
  label: string;
  button: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}) {
  return (
    <Form method="post" className="flex gap-2 items-center">
      <input type="hidden" name="command" value={command} />
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
