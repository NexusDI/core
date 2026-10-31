import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { HoloLabel, HullCrop, Schematic } from '@nexusdi/meridian-ui';
import type { NexusGraph } from '@nexusdi/devtools';

import {
  CROPS,
  BREAK_PX,
  FRAME,
  HIT_PX,
  PARTS_IN_HULL_ORDER,
  partById,
  partsInRun,
  runScale,
  type Part,
  type Point,
  type SectionId,
} from './geometry';
import { Overlay, placardLines, type PartHandlers } from './Overlay';
import { stageBase } from './stage-base';
import type { Callout, Note, ShipView } from './ship-view';

/**
 * The bay's stage: the painted cutaway with the state tint, and the overlay
 * of parts over it. On a wide screen it is one schematic of the whole ship.
 * On a phone it is the crops of one hull section, one schematic for each run
 * of the ship, side by side at one scale with a break mark between them
 * (site UX spec 4.11, TL17). `layout="both"` renders the two and lets the
 * stylesheet show one: the server's markup has the same shape as the
 * controller's, so the bay never moves when the controller arrives.
 */

export type Layout = 'wide' | 'phone';

export interface StageProps {
  markup: string;
  layout: Layout | 'both';
  view: ShipView;
  section: SectionId;
  handlers: PartHandlers | null;
  hint: string | null;
  hover: string | null;
  outline: string | null;
  graph: NexusGraph | null;
  /** The width of the stage in CSS pixels. */
  width: { wide: number; phone: number };
  coarse: boolean;
  /** Dims the physical conduits while the overlay shows the graph. */
  showGraph: boolean;
}

const WIDE_SIZES = '(min-width: 1440px) 1344px, calc(100vw - 2rem)';

const percent = (
  point: Point,
  box: readonly [number, number, number, number],
) => ({
  left: `${((point[0] - box[0]) / box[2]) * 100}%`,
  top: `${((point[1] - box[1]) / box[3]) * 100}%`,
});

function Callouts({
  items,
  notes,
  hover,
  hint,
  view,
  keep,
}: {
  hint: string | null;
  items: readonly Callout[];
  notes: readonly Note[];
  hover: string | null;
  view: ShipView;
  keep: (point: Point) => boolean;
}) {
  const part = hover ? partById(hover) : undefined;
  const hinted = hint ? partById(hint) : undefined;
  return (
    <div className="nexus-bay__callouts" aria-hidden="true">
      {hinted && keep(hinted.at) ? (
        <p
          className="nexus-bay__hint"
          style={percent(hinted.at, FRAME) as CSSProperties}
        >
          Click a conduit to cut it
        </p>
      ) : null}
      {items
        .filter((item) => keep(item.at))
        .map((item) => (
          <div
            key={item.id}
            className={`nexus-bay__callout nexus-bay__callout--${item.tone}`}
            style={percent(item.at, FRAME) as CSSProperties}
          >
            <HoloLabel
              title={item.title}
              leader="bottom"
              readouts={
                item.readouts.slice(0, 4) as [{ label: string; value: string }]
              }
            />
          </div>
        ))}
      {notes
        .filter((note) => keep(note.at))
        .map((note) => (
          <p
            key={note.id}
            className="nexus-bay__note"
            style={percent(note.at, FRAME) as CSSProperties}
          >
            {note.text}
          </p>
        ))}
      {part && keep(part.at) ? (
        <p
          className="nexus-bay__placard"
          style={percent(part.at, FRAME) as CSSProperties}
        >
          {(() => {
            const [first, second] = placardLines(part, view);
            return (
              <>
                <span>{first}</span>
                <small>{second}</small>
              </>
            );
          })()}
        </p>
      ) : null}
    </div>
  );
}

function Hull({
  markup,
  scope,
  parts,
  props,
  ppm,
  keep,
}: {
  markup: string;
  scope: string;
  parts: readonly Part[];
  props: StageProps;
  ppm: number;
  keep: (point: Point) => boolean;
}): ReactNode {
  const { view } = props;
  return (
    <div className="nexus-bay__hull">
      <Schematic
        markup={markup}
        base={stageBase(WIDE_SIZES)}
        rooms={view.light.rooms}
        fixtures={view.light.fixtures}
        doors={view.light.doors}
        scope={scope}
        label="The Meridian. Each part you can press is a button, in hull order from bow to stern."
      >
        <Overlay
          scope={scope}
          parts={parts}
          view={view}
          ppm={ppm}
          hitPx={props.coarse ? HIT_PX.coarse : HIT_PX.fine}
          handlers={props.handlers}
          hint={props.hint}
          hover={props.hover}
          outline={props.outline}
          graph={props.graph}
        />
      </Schematic>
      <Callouts
        items={view.callouts}
        notes={view.notes}
        hover={props.hover}
        hint={props.hint}
        view={view}
        keep={keep}
      />
    </div>
  );
}

export function Stage(props: StageProps) {
  const { layout, markup, section } = props;
  const wide = layout === 'wide' || layout === 'both';
  const phone = layout === 'phone' || layout === 'both';
  const crop = CROPS[section];
  const ppmPhone = runScale(section, props.width.phone);
  // Each run takes its share of the width that the break marks leave, so the
  // server's markup fits any phone and the controller measures nothing for it.
  const total = crop.runs.reduce((sum, [from, to]) => sum + to - from, 0);
  const share = (metres: number) =>
    `calc((100% - ${BREAK_PX * (crop.runs.length - 1)}px) * ${metres / total})`;
  const className = `nexus-bay__stage${props.showGraph ? ' is-graph' : ''}`;
  return (
    <div className={className}>
      {wide ? (
        <div className="nexus-bay__wide">
          <Hull
            markup={markup}
            scope="bay"
            parts={PARTS_IN_HULL_ORDER}
            props={props}
            ppm={Math.min(props.width.wide, 1180) / FRAME[2]}
            keep={() => true}
          />
        </div>
      ) : null}
      {phone ? (
        <div className="nexus-bay__phone" data-section={section}>
          <div className="nexus-bay__runs">
            {crop.runs.map(([from, to], run) => (
              <Fragment key={run}>
                {run > 0 ? <BreakMark /> : null}
                <div
                  className="nexus-bay__run"
                  style={{ inlineSize: share(to - from) }}
                >
                  <HullCrop
                    full={FRAME}
                    crop={[from, crop.y[0], to - from, crop.y[1] - crop.y[0]]}
                  >
                    <Hull
                      markup={markup}
                      scope={`bay-${section}-${run}`}
                      parts={partsInRun(section, run)}
                      props={props}
                      ppm={ppmPhone}
                      keep={(point) => point[0] >= from && point[0] <= to}
                    />
                  </HullCrop>
                </div>
              </Fragment>
            ))}
          </div>
          <div className="nexus-bay__run-names">
            {crop.names.map((name, at) => (
              <span
                key={name}
                style={{
                  inlineSize: `calc(${share((crop.runs[at]?.[1] ?? 0) - (crop.runs[at]?.[0] ?? 0))} + ${at === 0 ? 0 : BREAK_PX}px)`,
                }}
              >
                {name} ({SECTION_MODULE[section]})
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SECTION_MODULE: Readonly<Record<SectionId, string>> = {
  meridian: 'Meridian',
  engineering: 'Engineering',
  tactical: 'Tactical',
  comms: 'Comms',
  bridgeapi: 'BridgeApi',
};

function BreakMark() {
  return (
    <div className="nexus-bay__break" aria-hidden="true">
      <svg viewBox="0 0 18 100" preserveAspectRatio="none">
        <path
          d="M6 0 L12 12 L6 24 L12 36 L6 48 L12 60 L6 72 L12 84 L6 100"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
