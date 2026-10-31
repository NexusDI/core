import type { KeyboardEvent, ReactNode } from 'react';
import type { NexusGraph } from '@nexusdi/devtools';
import { hazardId } from '@nexusdi/meridian-ui';
import type {
  ConduitId,
  HatchId,
  SystemId,
} from '@nexusdi/meridian/scenes/front-page';

import {
  SYSTEM_WORD,
  cutPath,
  partById,
  type Part,
  type Point,
} from './geometry';
import type { ShipView } from './ship-view';
import type { SystemStatus } from './power';

/**
 * What the overlay `<svg>` of a painted `Schematic` draws (owner ruling OR3):
 * the conduits, the system glyphs, the hatch markers and the chart server
 * link, each a focusable part of the ship that performs one container
 * operation when it is pressed. Without handlers the same parts draw as
 * plain, hidden shapes, which is how the server renders them.
 */

export interface PartHandlers {
  onPress(part: Part): void;
  onHover(id: string | null): void;
}

const fmt = (point: Point): string => `${point[0]},${point[1]}`;
const line = (points: readonly Point[]): string =>
  `M${points.map(fmt).join(' L')}`;

const SYSTEM_STATE_WORD: Readonly<Record<SystemStatus, string>> = {
  idle: 'Idle',
  active: 'Starting',
  nominal: 'Online',
  standby: 'On standby',
  alarm: 'Failed',
  offline: 'Offline',
};

/** The accessible name of a part: the ship word, the code name, the state word and the action. */
export function labelOf(part: Part, view: ShipView): string {
  switch (part.kind) {
    case 'conduit': {
      const status = view.conduits[part.key as ConduitId];
      return `${part.ship}: ${part.code}. ${status === 'intact' ? 'Connected. Click to cut.' : 'Cut. Click to restore.'}`;
    }
    case 'system': {
      const id = part.key as SystemId;
      const status = view.systems[id];
      return `${part.ship}: ${SYSTEM_WORD[id]}, ${part.code}. ${SYSTEM_STATE_WORD[status]}. Click to ${status === 'offline' ? 'bring online' : 'take offline'}.`;
    }
    case 'hatch': {
      const closed = view.hatches[part.key as HatchId] === 'closed';
      return `${part.ship}: ${part.code}. ${closed ? 'Closed. Click to open.' : 'Open. Click to close.'}`;
    }
    default:
      return view.chartServer === 'reachable'
        ? "Chart server link in the chart room: reachable. Click to mark unreachable; NavCharts' factory then rejects at launch."
        : 'Chart server link in the chart room: unreachable. Click to restore.';
  }
}

/** The hover placard of a part: its ship word with the code name, and what a press does. */
export function placardLines(part: Part, view: ShipView): [string, string] {
  switch (part.kind) {
    case 'conduit':
      return [
        `${part.ship}: ${part.code}`,
        view.conduits[part.key as ConduitId] === 'intact'
          ? 'Click to cut'
          : 'Click to restore',
      ];
    case 'system':
      return [
        `${part.ship}: ${part.code}`,
        view.systems[part.key as SystemId] === 'offline'
          ? 'Click to bring online'
          : 'Click to take offline',
      ];
    case 'hatch':
      return [
        `${part.ship}: ${part.code}`,
        view.hatches[part.key as HatchId] === 'closed'
          ? 'Click to open'
          : 'Click to close',
      ];
    default:
      return [
        'Chart server link, chart room',
        view.chartServer === 'reachable'
          ? 'Click to make it unreachable'
          : 'Click to restore',
      ];
  }
}

function press(
  part: Part,
  handlers: PartHandlers,
): {
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
} {
  // A button presses on Enter at key down and on Space at key up, so a held
  // Space presses once and a reader can move off it before release.
  return {
    onClick: () => handlers.onPress(part),
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handlers.onPress(part);
      } else if (event.key === ' ') {
        event.preventDefault();
      }
    },
    onKeyUp: (event) => {
      if (event.key === ' ') handlers.onPress(part);
    },
  };
}

function SystemGlyph({
  at,
  s,
  status,
}: {
  at: Point;
  s: number;
  status: SystemStatus;
}) {
  const [x, y] = at;
  const h = s / 2;
  const plate = (
    <rect
      className="bay-plate"
      x={x - s * 0.75}
      y={y - s * 0.75}
      width={s * 1.5}
      height={s * 1.5}
    />
  );
  switch (status) {
    case 'nominal':
      return (
        <>
          {plate}
          <rect
            className="bay-g bay-g--nominal"
            x={x - h * 0.6}
            y={y - h * 0.6}
            width={s * 0.6}
            height={s * 0.6}
          />
        </>
      );
    case 'active':
      return (
        <>
          {plate}
          <circle className="bay-g bay-g--active" cx={x} cy={y} r={h * 0.7} />
        </>
      );
    case 'alarm':
      return (
        <>
          {plate}
          <path
            className="bay-g bay-g--alarm"
            d={`M${x},${y - h} L${x + h},${y} L${x},${y + h} L${x - h},${y} Z`}
          />
        </>
      );
    case 'offline':
      return (
        <>
          {plate}
          <circle className="bay-g bay-g--offline" cx={x} cy={y} r={h * 0.7} />
          <path
            className="bay-g bay-g--offline"
            d={`M${x - h * 0.5},${y - h * 0.5} L${x + h * 0.5},${y + h * 0.5} M${x + h * 0.5},${y - h * 0.5} L${x - h * 0.5},${y + h * 0.5}`}
          />
        </>
      );
    case 'standby':
      return (
        <>
          {plate}
          <circle className="bay-g bay-g--standby" cx={x} cy={y} r={h * 0.6} />
        </>
      );
    default:
      return (
        <>
          {plate}
          <rect
            className="bay-g bay-g--idle"
            x={x - h * 0.55}
            y={y - h * 0.55}
            width={s * 0.55}
            height={s * 0.55}
          />
        </>
      );
  }
}

function HatchGlyph({
  at,
  s,
  vertical,
  status,
  scope,
}: {
  at: Point;
  s: number;
  vertical: boolean;
  status: 'open' | 'closed' | 'alarm';
  scope: string;
}) {
  const [x, y] = at;
  const long = s * 1.1;
  const short = s * 0.45;
  const w = vertical ? short : long;
  const h = vertical ? long : short;
  return (
    <>
      <rect
        className="bay-plate"
        x={x - w / 2 - s * 0.2}
        y={y - h / 2 - s * 0.2}
        width={w + s * 0.4}
        height={h + s * 0.4}
      />
      <rect
        className={`bay-hatch bay-hatch--${status}`}
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        style={
          status === 'closed' ? { fill: `url(#${hazardId(scope)})` } : undefined
        }
      />
    </>
  );
}

function ChartGlyph({
  at,
  s,
  state,
}: {
  at: Point;
  s: number;
  state: ShipView['chartServer'];
}) {
  const [x, y] = at;
  const w = s * 2.2;
  const h = s * 1.4;
  const bad = state !== 'reachable';
  return (
    <>
      <rect
        className={`bay-plate bay-chart bay-chart--${state}`}
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
      />
      {bad ? (
        <path
          className="bay-g bay-g--alarm-line"
          d={`M${x - w * 0.25},${y - h * 0.25} L${x + w * 0.25},${y + h * 0.25} M${x + w * 0.25},${y - h * 0.25} L${x - w * 0.25},${y + h * 0.25}`}
        />
      ) : (
        <path
          className="bay-g bay-g--bars"
          d={`M${x - w * 0.25},${y + h * 0.25} L${x - w * 0.25},${y - h * 0.05} M${x},${y + h * 0.25} L${x},${y - h * 0.2} M${x + w * 0.25},${y + h * 0.25} L${x + w * 0.25},${y - h * 0.3}`}
        />
      )}
    </>
  );
}

export interface OverlayProps {
  scope: string;
  parts: readonly Part[];
  view: ShipView;
  /** Pixels per metre of this schematic on screen. */
  ppm: number;
  /** The hit diameter in CSS pixels. */
  hitPx: number;
  handlers: PartHandlers | null;
  /** The part the idle hint pulses on, or null once a reader used a control. */
  hint: string | null;
  hover: string | null;
  /** The part a focused switch outlines. */
  outline: string | null;
  graph: NexusGraph | null;
}

/** The overlay's children for one schematic: pass them to `Schematic`. */
export function Overlay({
  scope,
  parts,
  view,
  ppm,
  hitPx,
  handlers,
  hint,
  hover,
  outline,
  graph,
}: OverlayProps): ReactNode {
  const s = Math.max(0.75, 14 / ppm);
  const arrow = `bay-arrow-${scope}`;
  const hitR = hitPx / 2 / ppm;
  return (
    <>
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="0.7"
          markerHeight="0.7"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path className="bay-arrow" d="M0,0.8 L5,3 L0,5.2" />
        </marker>
      </defs>
      {graph ? <GraphEdges graph={graph} arrow={arrow} /> : null}
      {view.sockets.map((socket) => {
        const width = socket.token.length * 0.32 + 0.6;
        const x = socket.at[0] - width / 2;
        const y = socket.at[1] + s * 0.95;
        return (
          <g
            key={`socket-${socket.token}-${socket.at.join(',')}`}
            className="bay-socket"
            aria-hidden="true"
          >
            <rect
              className="bay-socket__box"
              x={x}
              y={y}
              width={width}
              height={s}
            />
            <text className="bay-socket__text" x={x + 0.3} y={y + s * 0.68}>
              {socket.token}
            </text>
          </g>
        );
      })}
      {parts.map((part) => {
        const interactive = handlers !== null;
        const classes = ['bay-part', `bay-part--${part.kind}`];
        if (hint === part.id) classes.push('is-hint');
        if (hover === part.id) classes.push('is-hover');
        if (outline === part.id) classes.push('is-outlined');
        const common = interactive
          ? {
              role: 'button' as const,
              tabIndex: 0,
              'aria-label': labelOf(part, view),
              onPointerEnter: () => handlers.onHover(part.id),
              onPointerLeave: () => handlers.onHover(null),
              onFocus: () => handlers.onHover(part.id),
              onBlur: () => handlers.onHover(null),
              ...press(part, handlers),
              'data-bay-part': part.id,
            }
          : { 'aria-hidden': true as const };
        if (part.kind === 'conduit' && part.path) {
          const status = view.conduits[part.key as ConduitId];
          const d = line(part.path);
          return (
            <g
              key={part.id}
              className={[...classes, `is-${status}`].join(' ')}
              {...common}
            >
              <path className="bay-ring" d={d} />
              {status === 'intact' ? (
                <path className="bay-edge" d={d} markerEnd={`url(#${arrow})`} />
              ) : (
                <>
                  {cutPath(part.path, part.at).map((piece, at) => (
                    <path
                      key={at}
                      className="bay-edge bay-edge--cut"
                      d={line(piece)}
                    />
                  ))}
                  <circle
                    className="bay-break"
                    cx={part.at[0]}
                    cy={part.at[1]}
                    r={0.34}
                  />
                </>
              )}
              {status === 'intact' ? (
                <circle
                  className="bay-handle"
                  cx={part.at[0]}
                  cy={part.at[1]}
                  r={0.24}
                />
              ) : null}
              {interactive ? (
                <circle
                  className="bay-hit"
                  cx={part.at[0]}
                  cy={part.at[1]}
                  r={hitR}
                />
              ) : null}
            </g>
          );
        }
        let glyph: ReactNode;
        if (part.kind === 'system') {
          glyph = (
            <SystemGlyph
              at={part.at}
              s={s}
              status={view.systems[part.key as SystemId]}
            />
          );
        } else if (part.kind === 'hatch') {
          glyph = (
            <HatchGlyph
              at={part.at}
              s={s}
              vertical={part.key === 'SubspaceLink'}
              status={view.hatches[part.key as HatchId]}
              scope={scope}
            />
          );
        } else {
          glyph = <ChartGlyph at={part.at} s={s} state={view.chartServer} />;
        }
        return (
          <g key={part.id} className={classes.join(' ')} {...common}>
            <rect
              className="bay-ring"
              x={part.at[0] - s * 1.1}
              y={part.at[1] - s * 1.1}
              width={s * 2.2}
              height={s * 2.2}
            />
            {glyph}
            {interactive ? (
              <circle
                className="bay-hit"
                cx={part.at[0]}
                cy={part.at[1]}
                r={hitR}
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/** The `inspect()` edges over the ship, in the DI edge styles of design system 8.4. */
function GraphEdges({ graph, arrow }: { graph: NexusGraph; arrow: string }) {
  const place = (providerId: string): Point | null => {
    const token = graph.providers.find((each) => each.id === providerId)?.token;
    return token === undefined
      ? null
      : (partById(`system-${token}`)?.at ?? null);
  };
  return (
    <g className="bay-graph" aria-hidden="true">
      {graph.edges.map((edge, at) => {
        const from = place(edge.from);
        const to = place(edge.to);
        if (from === null || to === null) return null;
        const dashed = edge.kind === 'optional' || edge.kind === 'lazy';
        return (
          <path
            key={`${edge.from}-${edge.to}-${at}`}
            className={`bay-di${dashed ? ' bay-di--dashed' : ''}`}
            d={`M${fmt(from)} L${fmt(to)}`}
            markerEnd={`url(#${arrow})`}
          />
        );
      })}
    </g>
  );
}
