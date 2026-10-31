import type { MouseEvent, ReactNode } from 'react';

import { cx } from './class-names.js';

/** A room's power state (design system spec 8.4). */
export type RoomState = 'powered' | 'unpowered' | 'alarm';

/** A fixture shows the room states, and `offline` for a system taken out. */
export type FixtureState = RoomState | 'offline';

/** A door is `open`, or `closed` and drawn with hazard bands in an alarm outline. */
export type DoorState = 'open' | 'closed';

interface SchematicBaseProps {
  /**
   * The cutaway's SVG markup, from `tools/meridian-ship/ship_svg.py
   * --schematic`. Each part carries `data-room`, `data-door` or
   * `data-fixture`. The component writes it as given and imports no geometry.
   */
  markup: string;
  /** State by room id. A room not listed keeps the plain fill. */
  rooms?: Readonly<Record<string, RoomState>>;
  /** State by fixture id. */
  fixtures?: Readonly<Record<string, FixtureState>>;
  /** State by door id. */
  doors?: Readonly<Record<string, DoorState>>;
  /**
   * The one click handler. The app delegates: it reads `event.target` and the
   * `data-*` of the part or hotspot that was hit.
   */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /**
   * The overlay's `viewBox`. It defaults to the markup's own.
   */
  viewBox?: string;
  /**
   * Names this ship in the generated selectors, so that two schematics on a
   * page keep their states apart. Defaults to `ship`.
   */
  scope?: string;
  className?: string;
}

/**
 * The overlay slot. The app draws conduits, system glyphs, hatch markers and
 * hotspots in it. They render in an overlay `<svg>` that shares the cutaway's
 * `viewBox` and stacks over the markup, so they use the cutaway's metre
 * coordinates. The overlay is accessible, so `label` names it and is required
 * with `children`.
 *
 * An SVG element takes no key presses of its own. A hotspot must be an SVG
 * `<a href>`, which takes focus and activates on Enter, or carry its own key
 * handler for Enter and Space.
 */
type SchematicOverlayProps =
  | { children?: undefined; label?: undefined }
  | { children: ReactNode; label: string };

export type SchematicProps = SchematicBaseProps & SchematicOverlayProps;

/**
 * The vector cutaway with a state for each room, door and fixture.
 *
 * It sets the states with no hook and no DOM write. It renders the markup and
 * a generated `<style>` block whose selectors match `data-room`, `data-door`
 * and `data-fixture`, with every id CSS-escaped. The look of each state lives
 * in `styles.css` as custom properties and keyframes; the generated block
 * only points each part at them, so it holds no colour.
 *
 * States, from design system spec 8.4:
 *
 * - room: `powered` (a `lamp` tint at 12% over the room fill), `unpowered`
 *   (the plain fill, screens lit), `alarm` (an `alarm` fill at 12% pulsing at
 *   1 Hz, steady under reduced motion, with a dashed outline so colour does
 *   not carry the state alone)
 * - fixture: the room states, and `offline` (dimmed with a dashed outline)
 * - door: `open`, and `closed` (hazard bands from the markup's `#sv-hazard`
 *   pattern, with an `alarm` outline)
 * - fixture `alarm` also takes a heavy dashed outline, so neither state rests
 *   on colour or on the pulse alone
 *
 * The markup layer is `aria-hidden`. The overlay is not, so the hotspots in it
 * take focus and carry the names a reader needs.
 */
export function Schematic({
  markup,
  rooms,
  fixtures,
  doors,
  onClick,
  children,
  viewBox,
  label,
  scope = 'ship',
  className,
}: SchematicProps) {
  const css = stateStyles(scope, rooms, fixtures, doors);
  const box = viewBox ?? viewBoxOf(markup);
  return (
    <div
      className={cx('meridian-schematic', className)}
      data-schematic={scope}
      onClick={onClick}
    >
      <div
        className="meridian-schematic__art"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children ? (
        <svg
          className="meridian-schematic__overlay"
          viewBox={box}
          role="group"
          aria-label={label}
        >
          {children}
        </svg>
      ) : null}
    </div>
  );
}

/** The `viewBox` of the first `<svg>` in the markup, or undefined. */
function viewBoxOf(markup: string): string | undefined {
  return /<svg\b[^>]*?\sviewBox="([^"]*)"/.exec(markup)?.[1];
}

/**
 * Escapes a string for use as a CSS identifier or inside a quoted CSS string,
 * after the CSSOM `CSS.escape` algorithm, which the server does not have.
 */
export function cssEscape(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const char = value.charAt(i);
    if (code === 0) {
      out += '�';
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && value.charCodeAt(0) === 0x2d)
    ) {
      out += `\\${code.toString(16)} `;
    } else if (i === 0 && value.length === 1 && code === 0x2d) {
      out += `\\${char}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      out += char;
    } else {
      out += `\\${char}`;
    }
  }
  return out;
}

/**
 * The declarations of each state. They name custom properties and keyframes
 * that `styles.css` defines, so the generated text never holds a colour.
 */
const ROOM_DECLARATIONS: Readonly<Record<RoomState, string>> = {
  powered: 'fill:var(--meridian-sv-room-powered)',
  unpowered: 'fill:var(--meridian-sv-room)',
  alarm:
    'fill:var(--meridian-sv-room-alarm);stroke:var(--meridian-alarm);stroke-width:0.1;stroke-dasharray:0.4 0.2;animation:meridian-sv-alarm 1s ease-in-out infinite',
};
const FIXTURE_DECLARATIONS: Readonly<Record<FixtureState, string>> = {
  powered: 'fill:var(--meridian-sv-fixture-powered)',
  unpowered: 'fill:var(--meridian-sv-fixture)',
  alarm:
    'fill:var(--meridian-alarm);stroke:var(--meridian-text);stroke-width:0.12;stroke-dasharray:0.3 0.15;animation:meridian-sv-alarm-fixture 1s ease-in-out infinite',
  offline:
    'fill:var(--meridian-sv-fixture);opacity:0.35;stroke:var(--meridian-text-secondary);stroke-width:0.1;stroke-dasharray:0.3 0.2',
};
const DOOR_DECLARATIONS: Readonly<Record<DoorState, string>> = {
  open: 'fill:var(--meridian-sv-door)',
  closed: 'fill:url(#sv-hazard);stroke:var(--meridian-alarm);stroke-width:0.08',
};

function rule(
  scope: string,
  attribute: string,
  id: string,
  declarations: string,
): string {
  return `.meridian-schematic[data-schematic="${cssEscape(scope)}"] [${attribute}="${cssEscape(id)}"]{${declarations}}`;
}

/** One rule per listed id with a known state, sorted so the output is stable. */
function stateStyles(
  scope: string,
  rooms: SchematicProps['rooms'],
  fixtures: SchematicProps['fixtures'],
  doors: SchematicProps['doors'],
): string {
  const rules: string[] = [];
  const add = (
    table: Readonly<Record<string, string>> | undefined,
    attribute: string,
    declarations: Readonly<Record<string, string>>,
  ) => {
    if (!table) return;
    for (const id of Object.keys(table).sort()) {
      const state = table[id];
      const found =
        state !== undefined && Object.hasOwn(declarations, state)
          ? declarations[state]
          : undefined;
      if (found !== undefined) rules.push(rule(scope, attribute, id, found));
    }
  };
  add(rooms, 'data-room', ROOM_DECLARATIONS);
  add(fixtures, 'data-fixture', FIXTURE_DECLARATIONS);
  add(doors, 'data-door', DOOR_DECLARATIONS);
  return rules.join('\n');
}
