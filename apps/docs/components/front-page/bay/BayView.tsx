import type { KeyboardEvent, ReactNode } from 'react';
import type { NexusGraph } from '@nexusdi/devtools';
import {
  Alert,
  Button,
  StepList,
  Switch,
  Terminal,
  type TerminalLine,
} from '@nexusdi/meridian-ui';

import {
  PARTS_IN_HULL_ORDER,
  SECTIONS,
  placardOf,
  type Part,
  type SectionId,
} from './geometry';
import type { PartHandlers } from './Overlay';
import type { LevelLine } from './power';
import type { LogLine } from './terminal';
import { Stage, type Layout } from './Stage';
import { isIntact, type BayState } from './state';
import { alarmedSections, type ShipView } from './ship-view';

/**
 * The bay as one component for the server and the controller (site UX spec
 * 4.3, owner rulings OR1 to OR3). The server passes no handlers: the bay then
 * renders the lit seed, `pre-flight ok` and no control. The controller passes
 * the handlers and the live model. One screen frame holds the heading above,
 * the ship's frame (alert band, toolbar, legend, stage), and under it the
 * terminal with Launch and Reset, and the "On the ship" panel.
 */

export interface Stamped extends LogLine {
  readonly tick: number;
  /** The run the line belongs to. The terminal shows the newest run. */
  readonly block: number;
}

export interface Actions extends PartHandlers {
  onSection(id: SectionId): void;
  onLaunch(): void;
  onReset(): void;
  onErrors(on: boolean): void;
  onTab(tab: 'run' | 'source'): void;
  onGraph(on: boolean): void;
  onAcknowledge(): void;
  onApplyFix(): void;
  onOutline(id: string | null): void;
}

export interface BayViewProps {
  markup: string;
  layout: Layout | 'both';
  view: ShipView;
  state: BayState;
  section: SectionId;
  log: readonly Stamped[];
  tab: 'run' | 'source';
  source: string;
  /** The status word beside the exit code. */
  status: 'nominal' | 'alarm' | 'running';
  exit: number | null;
  errorsOn: boolean;
  /** The label of the launch button. */
  launchLabel: string;
  /** Why Launch is locked, or null while it is open. */
  locked: string | null;
  launching: boolean;
  checkWord: string;
  caption: string | null;
  levels: readonly LevelLine[];
  currentLevel: string | undefined;
  hint: string | null;
  hover: string | null;
  outline: string | null;
  graph: NexusGraph | null;
  showGraph: boolean;
  acknowledged: boolean;
  announce: string;
  /** The codes that have a page. The terminal links these and shows any other as text. */
  errorPages: readonly string[];
  /** The lit canvas of the wide stage, when the bay has one. */
  light?: {
    canvas: ReactNode;
    runCanvas: (run: number) => ReactNode;
    lit: boolean;
  } | null;
  width: { wide: number; phone: number };
  coarse: boolean;
  actions: Actions | null;
}

const STATES = {
  ok: 'nominal',
  pass: 'nominal',
  alarm: 'alarm',
  fail: 'alarm',
  running: 'active',
  nominal: 'nominal',
} as const;

/**
 * The arrow keys of a tab strip (the ARIA authoring practices): the arrows
 * move to the next or previous tab, Home and End to the first and last, the
 * tab that is selected takes the tab stop, and focus follows the selection.
 */
function arrowTabs<Id extends string>(
  event: KeyboardEvent<HTMLElement>,
  ids: readonly Id[],
  current: Id,
  select: (id: Id) => void,
): void {
  const at = ids.indexOf(current);
  let next: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
    next = (at + 1) % ids.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
    next = (at - 1 + ids.length) % ids.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = ids.length - 1;
  else return;
  event.preventDefault();
  const id = ids[next];
  if (id === undefined) return;
  select(id);
  const tabs =
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    );
  tabs?.[next]?.focus();
}

const tick = (n: number): string => `t ${String(n).padStart(4, '0')}`;

function terminalLines(
  log: readonly Stamped[],
  errorPages: readonly string[],
): TerminalLine[] {
  const newest = log[log.length - 1]?.block;
  return log
    .filter((line) => line.block === newest)
    .map((line) => ({
      tick: tick(line.tick),
      source: line.source,
      message: line.codes ? (
        line.codes.map((code, at) => (
          <span key={code}>
            {at > 0 ? ' ' : null}
            {errorPages.includes(code) ? (
              <a href={`/errors/${code}/`}>{code}</a>
            ) : (
              <span>{code}</span>
            )}
          </span>
        ))
      ) : (
        <>
          {line.text}
          {line.value ? (
            <>
              {' '}
              <data value={line.value}>{line.value}</data>
            </>
          ) : null}
        </>
      ),
      status: line.status,
    }));
}

const KINDS: readonly { glyph: string; word: string; text: ReactNode }[] = [
  {
    glyph: 'conduit',
    word: 'Conduit',
    text: (
      <>
        click to cut. <code>check</code> reruns.
      </>
    ),
  },
  { glyph: 'system', word: 'System', text: 'click to take it offline.' },
  { glyph: 'hatch', word: 'Hatch', text: 'click to close it.' },
  {
    glyph: 'chart-server',
    word: 'Chart server link',
    text: 'click to make it unreachable. The check still passes; launch fails.',
  },
];

const LEGEND: readonly { glyph: string; word: string; code: string }[] = [
  { glyph: 'section', word: 'Hull section', code: 'module' },
  { glyph: 'system', word: 'System', code: 'provider' },
  { glyph: 'conduit', word: 'Conduit', code: 'dependency' },
  { glyph: 'hatch', word: 'Hatch', code: 'export' },
];

function Glyph({ name }: { name: string }) {
  return (
    <span
      className={`nexus-bay__glyph nexus-bay__glyph--${name}`}
      aria-hidden="true"
    />
  );
}

function stateWords(part: Part): [on: string, off: string] {
  switch (part.kind) {
    case 'conduit':
      return ['connected', 'cut'];
    case 'system':
      return ['online', 'offline'];
    case 'hatch':
      return ['open', 'closed'];
    default:
      return ['reachable', 'unreachable'];
  }
}

export function BayView(props: BayViewProps) {
  const { actions, view, state } = props;
  const interactive = actions !== null;
  const banner = view.banner;
  const showBanner = interactive && banner !== null && !props.acknowledged;
  const fix = banner?.fixes[0];
  return (
    <div className="nexus-bay__body" data-bay={interactive ? 'live' : 'static'}>
      <div className="nexus-bay__frame">
        {showBanner && banner ? (
          <div
            className="nexus-bay__alert"
            key={`${banner.code}-${banner.subject}`}
          >
            <Alert
              variant="banner"
              code={banner.code}
              codeHref={
                props.errorPages.includes(banner.code)
                  ? `/errors/${banner.code}/`
                  : undefined
              }
              subject={
                banner.count > 1
                  ? `${banner.subject}, ${banner.count} errors`
                  : banner.subject
              }
              message={banner.line}
              acknowledge={
                <>
                  {fix && actions ? (
                    <Button variant="secondary" onClick={actions.onApplyFix}>
                      Apply the fix
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={actions?.onAcknowledge}>
                    Acknowledge
                  </Button>
                </>
              }
            />
          </div>
        ) : null}

        <div className="nexus-bay__toolbar">
          <p className="nexus-bay__toolbar-title">
            <span>Side cutaway</span>
            <span className="nexus-bay__toolbar-hint">
              {props.hint
                ? 'Click a conduit to cut it'
                : 'Click a conduit, a system, a hatch or the chart server link'}
            </span>
          </p>
          {interactive && actions ? (
            <Switch
              name="graph"
              value="graph"
              label="Show the graph"
              onWord="on"
              offWord="off"
              checked={props.showGraph}
              onChange={(event) => actions.onGraph(event.target.checked)}
            />
          ) : null}
        </div>

        <div className="nexus-bay__legend">
          {LEGEND.map((item) => (
            <span key={item.word} className="nexus-bay__legend-item">
              <Glyph name={item.glyph} />
              <b>{item.word}</b>
              <span>= {item.code}</span>
            </span>
          ))}
        </div>

        {interactive && actions ? (
          <div
            className="nexus-bay__tabs"
            role="tablist"
            aria-label="Hull sections"
          >
            {SECTIONS.map((section) => {
              const alarmed = alarmedSections(view).has(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`bay-tab-${section.id}`}
                  aria-selected={props.section === section.id}
                  aria-controls="bay-panel"
                  aria-label={alarmed ? `${section.tab}, alarm` : undefined}
                  tabIndex={props.section === section.id ? 0 : -1}
                  className="nexus-bay__tab"
                  onClick={() => actions.onSection(section.id)}
                  onKeyDown={(event) =>
                    arrowTabs(
                      event,
                      SECTIONS.map((each) => each.id),
                      section.id,
                      actions.onSection,
                    )
                  }
                >
                  {alarmed ? (
                    <span className="nexus-bay__tab-alarm" aria-hidden="true">
                      {'\u25c6 '}
                    </span>
                  ) : null}
                  {section.tab}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="nexus-bay__tabs nexus-bay__tabs--reserve"
            aria-hidden="true"
          />
        )}
        <div
          id="bay-panel"
          className="nexus-bay__panel"
          role={interactive ? 'tabpanel' : undefined}
          aria-labelledby={interactive ? `bay-tab-${props.section}` : undefined}
        >
          <Stage
            markup={props.markup}
            layout={props.layout}
            view={view}
            section={props.section}
            handlers={actions}
            hint={props.hint}
            hover={props.hover}
            outline={props.outline}
            graph={props.graph}
            width={props.width}
            coarse={props.coarse}
            showGraph={props.showGraph}
            light={props.light ?? null}
          />
        </div>
      </div>

      <div className="nexus-bay__console">
        <div className="nexus-bay__termcol">
          <Terminal
            title="preflight.ts"
            lines={terminalLines(props.log, props.errorPages)}
            states={STATES}
            tabs={
              interactive && actions ? (
                <div
                  role="tablist"
                  aria-label="preflight.ts"
                  className="nexus-bay__term-tabs"
                >
                  {(['run', 'source'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={props.tab === tab}
                      tabIndex={props.tab === tab ? 0 : -1}
                      className="nexus-bay__term-tab"
                      onClick={() => actions.onTab(tab)}
                      onKeyDown={(event) =>
                        arrowTabs(
                          event,
                          ['run', 'source'] as const,
                          tab,
                          actions.onTab,
                        )
                      }
                    >
                      {tab === 'run' ? 'Run' : 'Source'}
                    </button>
                  ))}
                </div>
              ) : null
            }
            actions={
              <>
                {interactive && actions ? (
                  <Switch
                    name="errors"
                    value="errors"
                    label="errors()"
                    onWord="on"
                    offWord="off"
                    checked={props.errorsOn}
                    onChange={(event) => actions.onErrors(event.target.checked)}
                  />
                ) : null}
                <span
                  className={`nexus-bay__status nexus-bay__status--${props.status}`}
                >
                  <i aria-hidden="true" />
                  {props.status === 'nominal'
                    ? 'Nominal'
                    : props.status === 'alarm'
                      ? 'Alarm'
                      : 'Running pre-flight'}
                </span>
                {props.exit !== null ? (
                  <span className="nexus-bay__exit">exit {props.exit}</span>
                ) : null}
              </>
            }
            body={
              props.tab === 'source' ? (
                <pre className="nexus-bay__source">{props.source}</pre>
              ) : undefined
            }
          />
          {interactive && actions ? (
            <div className="nexus-bay__launch">
              <Button
                variant="primary"
                id="bay-launch"
                focusable
                disabled={props.locked !== null || props.launching}
                reason={props.locked ?? 'Powering up'}
                onClick={actions.onLaunch}
              >
                {props.launchLabel}
              </Button>
              <Button variant="secondary" onClick={actions.onReset}>
                Reset
              </Button>
              {props.locked === null && !props.launching ? (
                <span
                  className={`nexus-bay__check nexus-bay__check--${props.checkWord === 'Check passed' ? 'nominal' : props.status}`}
                >
                  <i aria-hidden="true" />
                  {props.checkWord}
                </span>
              ) : null}
              {props.caption ? (
                <p className="nexus-bay__caption">{props.caption}</p>
              ) : null}
            </div>
          ) : (
            <p className="nexus-bay__nojs">
              The pre-flight check runs in your browser with JavaScript.
            </p>
          )}
        </div>

        <aside className="nexus-bay__side" aria-label="On the ship">
          <header className="nexus-bay__side-head">
            <h3>On the ship</h3>
            <span>Reset restores the seed</span>
          </header>
          <ul className="nexus-bay__kinds">
            {KINDS.map((kind) => (
              <li key={kind.word}>
                <Glyph name={kind.glyph} />
                <span>
                  <b>{kind.word}</b> {kind.text}
                </span>
              </li>
            ))}
          </ul>
          {interactive && actions ? (
            <details className="nexus-bay__disclosure">
              <summary>
                Systems <small>every part as a switch, bow to stern</small>
              </summary>
              <ul className="nexus-bay__switches">
                {PARTS_IN_HULL_ORDER.map((part) => {
                  const [on, off] = stateWords(part);
                  return (
                    <li
                      key={part.id}
                      onFocus={() => actions.onOutline(part.id)}
                      onBlur={() => actions.onOutline(null)}
                    >
                      <Switch
                        name={part.id}
                        value={part.id}
                        label={placardOf(part)}
                        onWord={on}
                        offWord={off}
                        checked={isIntact(state, part)}
                        onChange={() => actions.onPress(part)}
                      />
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
          <details className="nexus-bay__disclosure">
            <summary>
              Power-up order <small>from the last launch</small>
            </summary>
            <StepList
              steps={props.levels.map((level) => ({
                id: String(level.level),
                label: level.text,
              }))}
              current={props.currentLevel}
            />
          </details>
        </aside>
      </div>

      <p className="nexus-visually-hidden" role="status" aria-live="polite">
        {props.announce}
      </p>
    </div>
  );
}
