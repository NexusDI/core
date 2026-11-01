'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NexusGraph } from '@nexusdi/devtools';
import type { ConduitId, SystemId } from '@nexusdi/meridian/scenes/front-page';
import type { TraceEvent } from '@nexusdi/core';

import { BayView, type Actions, type Stamped } from './BayView';
import { isSystemId, partById, type Part, type SectionId } from './geometry';
import { entriesOf, type CheckResult, type LaunchOutcome } from './outcome';
import { createPlayer, type Player } from './player';
import { RunMirror } from './run-mirror';
import {
  applyEvent,
  darkPower,
  levelLines,
  powerAfter,
  type LevelLine,
  type Power,
} from './power';
import { shipView } from './ship-view';
import { SEED_STATE, isIntact, withPart, type BayState } from './state';
import {
  captionOf,
  checkLines,
  launchHeader,
  launchLines,
  type LogLine,
} from './terminal';
import type * as Runtime from './run';
import type { BayLight } from './light';

/**
 * The bay controller (site UX spec 5.6, first chunk). It holds the state, the
 * switches, the bindings of the ship and the terminal, and loads the run
 * chunk (core, `@nexusdi/errors`, devtools, the seed) with `import()` when
 * the bay nears the viewport or on the first control. A control used before
 * the chunk arrives changes the ship at once and queues its check under a
 * "Running pre-flight" status. The marker below is how `check-budgets.mjs`
 * finds this chunk (12.1).
 */
const BAY_MARK = 'nexus-preflight-bay';

/** The program the CI step runs, which the Source tab shows (4.3). */
const SOURCE = `import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { Meridian } from './meridian.js';

Nexus.check(Meridian, { plugins: [errors()] }); // CI runs this
console.log('pre-flight ok');
`;

const RUNTIME_MARGIN = '600px';

/**
 * Why the lit scene does not start, or null when it may (TL24): a reader who
 * asked to save data, asked for reduced data, forces colours, or has no
 * WebGL 2 loads nothing of it and keeps the tints. A phone that reports less
 * than 4 GB of memory keeps them too (TL31).
 */
function litGate(phone: boolean): string | null {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData) return 'save-data';
  if (window.matchMedia('(prefers-reduced-data: reduce)').matches)
    return 'reduced-data';
  if (window.matchMedia('(forced-colors: active)').matches)
    return 'forced-colors';
  // Where the browser reports its memory, a phone with less than 4 GB keeps the tints.
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (phone && memory !== undefined && memory < 4) return 'low-memory';
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return 'no-webgl2';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return null;
}

export interface Initial {
  /** The codes that have a page under `/errors/`. */
  readonly errorPages: readonly string[];
  readonly log: readonly LogLine[];
  readonly levels: readonly LevelLine[];
  readonly power: Power;
}

interface Model {
  state: BayState;
  errorsOn: boolean;
  /** null while the check waits for the run chunk. */
  check: CheckResult | null;
  power: Power;
  online: readonly SystemId[];
  launch: 'idle' | 'running' | 'launched' | 'failed';
  launchedOnce: boolean;
  outcome: LaunchOutcome | null;
  linked: ConduitId | null;
  log: readonly Stamped[];
  levels: readonly LevelLine[];
  currentLevel: string | undefined;
  exit: number | null;
  interacted: boolean;
  section: SectionId;
  tab: 'run' | 'source';
  showGraph: boolean;
  graph: NexusGraph | null;
  hover: string | null;
  outline: string | null;
  acknowledged: boolean;
  announce: string;
  width: number;
  phone: boolean;
  coarse: boolean;
}

const stampAll = (
  lines: readonly LogLine[],
  from: number,
  block: number,
): Stamped[] =>
  lines.map((line, at) => ({ ...line, tick: from + at + 1, block }));

function initialModel(initial: Initial): Model {
  return {
    state: SEED_STATE,
    errorsOn: true,
    check: { ok: true, error: null },
    power: initial.power,
    online: [],
    launch: 'idle',
    launchedOnce: false,
    outcome: null,
    linked: null,
    log: stampAll(initial.log, 0, 0),
    levels: initial.levels,
    currentLevel: undefined,
    exit: 0,
    interacted: false,
    section: 'tactical',
    tab: 'run',
    showGraph: false,
    graph: null,
    hover: null,
    outline: null,
    acknowledged: false,
    announce: '',
    width: 1344,
    phone: false,
    coarse: false,
  };
}

const MAX_LINES = 80;

const plural = (count: number): string =>
  `${count} ${count === 1 ? 'error' : 'errors'}`;

export default function PreflightBay({
  markup,
  initial,
}: {
  markup: string;
  initial: Initial;
}) {
  const [model, setModel] = useState<Model>(() => initialModel(initial));
  const modelRef = useRef<Model>(model);
  const runtimeRef = useRef<typeof Runtime | null>(null);
  const loadingRef = useRef<Promise<typeof Runtime> | null>(null);
  const [runtimeMark, setRuntimeMark] = useState<string | null>(null);
  const runtimeReady = runtimeMark !== null;
  const shipRef = useRef<{ dispose(): Promise<void> } | null>(null);
  const disposingRef = useRef<Promise<void>>(Promise.resolve());
  const playerRef = useRef<Player | null>(null);
  const runRef = useRef(0);
  /** The power the ship had before the running launch darkened it. */
  const lastPowerRef = useRef<Power>(initial.power);
  const autoplayRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const patch = useCallback((change: Partial<Model>) => {
    modelRef.current = { ...modelRef.current, ...change };
    setModel(modelRef.current);
  }, []);

  /** Adds lines to the terminal, in a new run unless `same` continues the last one. */
  const append = useCallback(
    (lines: readonly LogLine[], same = false) => {
      const log = modelRef.current.log;
      const last = log[log.length - 1];
      const block = (last?.block ?? 0) + (same ? 0 : 1);
      patch({
        log: [...log, ...stampAll(lines, last?.tick ?? 0, block)].slice(
          -MAX_LINES,
        ),
      });
    },
    [patch],
  );

  const ensureRuntime = useCallback(async () => {
    if (runtimeRef.current) return runtimeRef.current;
    loadingRef.current ??= import('./run').then((loaded) => {
      runtimeRef.current = loaded;
      setRuntimeMark(loaded.runtimeMark());
      return loaded;
    });
    return loadingRef.current;
  }, []);

  const runCheck = useCallback(
    (state: BayState, restored: ConduitId | null) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const result = runtime.check(state, modelRef.current.errorsOn);
      const count = result.error ? entriesOf(result.error).length : 0;
      patch({
        check: result,
        linked: result.ok ? restored : null,
        exit: result.ok ? 0 : 1,
        acknowledged: false,
        announce: result.ok ? 'Check passed' : `Check failed: ${plural(count)}`,
      });
      append(checkLines(result));
      if (modelRef.current.showGraph) patch({ graph: runtime.graphOf(state) });
    },
    [append, patch],
  );

  /** Marks the first use of any control: the hint hides and autoplay yields. */
  const interact = useCallback(() => {
    if (autoplayRef.current) {
      autoplayRef.current = false;
      playerRef.current?.finish();
    }
    if (!modelRef.current.interacted) patch({ interacted: true });
  }, [patch]);

  const disposeShip = useCallback(() => {
    const ship = shipRef.current;
    shipRef.current = null;
    if (ship)
      disposingRef.current = disposingRef.current.then(() => ship.dispose());
    return disposingRef.current;
  }, []);

  const change = useCallback(
    (next: BayState, restored: ConduitId | null = null) => {
      interact();
      runRef.current += 1;
      void disposeShip();
      // A change during a power-up abandons it. The ship goes back to the
      // power it had, so it is not left half dark.
      const running = modelRef.current.launch === 'running';
      patch({
        ...(running ? { power: lastPowerRef.current } : {}),
        state: next,
        launch: 'idle',
        outcome: null,
        online: [],
        linked: null,
        acknowledged: false,
        check: runtimeRef.current ? modelRef.current.check : null,
      });
      if (runtimeRef.current) runCheck(next, restored);
      else
        void ensureRuntime().then(() =>
          runCheck(modelRef.current.state, restored),
        );
    },
    [disposeShip, ensureRuntime, interact, patch, runCheck],
  );

  const startLaunch = useCallback(
    async (autoplay: boolean) => {
      const runtime = await ensureRuntime();
      if (modelRef.current.check === null)
        runCheck(modelRef.current.state, null);
      if (!modelRef.current.check?.ok) return;
      await disposeShip();
      const id = ++runRef.current;
      const { state } = modelRef.current;
      const instant = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const events: TraceEvent[] = [];
      lastPowerRef.current = modelRef.current.power;
      patch({
        launch: 'running',
        outcome: null,
        online: [],
        levels: [],
        currentLevel: undefined,
        linked: null,
        announce: 'Launching',
        power: instant ? modelRef.current.power : darkPower(state),
      });
      append(launchHeader());
      const player = createPlayer(
        (batch) => {
          if (id !== runRef.current) return;
          const names = batch.flatMap((event) =>
            event.type === 'construct' && isSystemId(event.token)
              ? [event.token]
              : [],
          );
          const power = batch.reduce(applyEvent, modelRef.current.power);
          const seen = events.slice(
            0,
            events.indexOf(batch[batch.length - 1] as TraceEvent) + 1,
          );
          const lines = levelLines(seen);
          const done = lines.slice(0, -1);
          patch({
            power,
            online: names,
            levels: lines,
            currentLevel: lines[lines.length - 1]
              ? String(lines[lines.length - 1]?.level)
              : undefined,
            ...(done.length > 0
              ? { announce: done[done.length - 1]?.text ?? '' }
              : {}),
          });
        },
        { instant },
      );
      playerRef.current = player;
      autoplayRef.current = autoplay;
      const { outcome, ship } = await runtime.launch(state, (event) => {
        if (id !== runRef.current) return;
        events.push(event);
        if (!instant) player.push(event);
      });
      if (id !== runRef.current) {
        void ship?.dispose();
        return;
      }
      shipRef.current = ship;
      if (instant) patch({ power: powerAfter(state, events) });
      else await player.drain();
      if (id !== runRef.current) return;
      autoplayRef.current = false;
      const lines = levelLines(events);
      append(launchLines(outcome), true);
      patch({
        launch: outcome.ok ? 'launched' : 'failed',
        launchedOnce: true,
        outcome,
        online: [],
        levels: lines,
        currentLevel: undefined,
        exit: outcome.ok ? 0 : 1,
        announce: outcome.ok
          ? (lines[lines.length - 1]?.text ?? 'Launched')
          : 'Launch failed',
      });
    },
    [append, disposeShip, ensureRuntime, patch, runCheck],
  );

  const actions: Actions = {
    onPress(part: Part) {
      const next = withPart(
        modelRef.current.state,
        part,
        !isIntact(modelRef.current.state, part),
      );
      patch({ section: part.section });
      change(
        next,
        part.kind === 'conduit' && isIntact(next, part)
          ? (part.key as ConduitId)
          : null,
      );
    },
    onHover: (id) => patch({ hover: id }),
    onOutline: (id) => patch({ outline: id }),
    onSection(id) {
      interact();
      patch({ section: id });
    },
    onLaunch() {
      interact();
      void startLaunch(false);
    },
    onReset() {
      change(SEED_STATE);
    },
    onErrors(on) {
      interact();
      patch({ errorsOn: on });
      if (runtimeRef.current) runCheck(modelRef.current.state, null);
      else
        void ensureRuntime().then(() => runCheck(modelRef.current.state, null));
    },
    onTab(tab) {
      interact();
      patch({ tab });
    },
    onGraph(on) {
      interact();
      patch({ showGraph: on });
      if (on)
        void ensureRuntime().then((runtime) =>
          patch({ graph: runtime.graphOf(modelRef.current.state) }),
        );
      else patch({ graph: null });
    },
    onAcknowledge() {
      interact();
      patch({ acknowledged: true });
    },
    onApplyFix() {
      const fix = shipView(viewInput(modelRef.current)).banner?.fixes[0];
      if (!fix) return;
      const { state } = modelRef.current;
      if (fix.kind === 'import') {
        const part = partById(`conduit-${fix.conduit.replaceAll('>', '-')}`);
        if (part) {
          patch({ section: part.section });
          change(withPart(state, part, true), fix.conduit);
        }
      } else {
        const part = partById(`hatch-${fix.hatch}`);
        if (part) {
          patch({ section: part.section });
          change(withPart(state, part, true));
        }
      }
    },
  };

  // Measure the stage and the pointer.
  useEffect(() => {
    const root = rootRef.current;
    const phoneQuery = window.matchMedia('(max-width: 639px)');
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const measure = () =>
      patch({
        width:
          root?.querySelector<HTMLElement>('.nexus-bay__panel')?.clientWidth ??
          modelRef.current.width,
        phone: phoneQuery.matches,
        coarse: coarseQuery.matches || phoneQuery.matches,
      });
    measure();
    const observer = new ResizeObserver(measure);
    if (root) observer.observe(root);
    phoneQuery.addEventListener('change', measure);
    coarseQuery.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      phoneQuery.removeEventListener('change', measure);
      coarseQuery.removeEventListener('change', measure);
    };
  }, [patch]);

  // Load the run chunk when the bay nears the viewport, and play the power-up
  // once per session when it is at least half in view (Q5).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void ensureRuntime();
          near.disconnect();
        }
      },
      { rootMargin: RUNTIME_MARGIN },
    );
    near.observe(root);
    return () => near.disconnect();
  }, [ensureRuntime]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !runtimeReady) return;
    if (new URLSearchParams(window.location.search).get('power') === 'final')
      return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean };
      }
    ).connection;
    if (connection?.saveData) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (window.sessionStorage.getItem('nexus-power-up') === 'played') return;
    } catch {
      // Storage can be blocked; the power-up then plays once per load.
    }
    const half = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
        );
        if (!visible || modelRef.current.interacted) return;
        half.disconnect();
        try {
          window.sessionStorage.setItem('nexus-power-up', 'played');
        } catch {
          // Ignored: see above.
        }
        void startLaunch(true);
      },
      { threshold: [0.5] },
    );
    half.observe(root);
    return () => half.disconnect();
  }, [runtimeReady, startLaunch]);

  const view = shipView(viewInput(model));

  // The lit scene (owner ruling OR5, TL24, TL25 and TL31): the deck view draws
  // the room light. On a wide screen it draws on a canvas in the Schematic's
  // layer slot. On a phone it draws on one canvas off the page, and the
  // run mirror copies each frame to the crops of the section on show. It loads
  // once the bay is half in view and the browser is idle, and never under the
  // gates in `litGate`. The tints of the Schematic light the ship until the
  // first frame.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mirror] = useState(() => new RunMirror());
  const lightRef = useRef<BayLight | null>(null);
  const [lit, setLit] = useState(false);
  const [lightMark, setLightMark] = useState<string | null>(null);
  const [lightPhase, setLightPhase] = useState<
    'off' | 'loading' | 'on' | 'failed'
  >('off');
  const lightKey = JSON.stringify([view.light.rooms, view.light.glow]);

  useEffect(() => {
    lightRef.current?.source.update(view.light);
    // The key holds everything of the table that the source reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightKey]);

  // The crops of another section, or of another width, paint from the last frame.
  useEffect(() => {
    mirror.show(model.section);
  }, [mirror, model.section, model.width, model.phone]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || litGate(model.phone) !== null) return;
    const phone = model.phone;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let losses = 0;
    let unsubscribe: (() => void) | undefined;
    let stopFrames: (() => void) | undefined;
    const stages = () =>
      root.querySelectorAll<HTMLElement>('.meridian-schematic--painted');
    // The class goes on in the frame itself, so the canvas shows and the tints
    // drop away in one style write. The state follows so that React agrees.
    const show = () =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        for (const stage of stages())
          stage.classList.add('meridian-schematic--lit');
        setLit(true);
      });
    const hide = () => {
      for (const stage of stages())
        stage.classList.remove('meridian-schematic--lit');
      setLit(false);
    };
    const start = async () => {
      setLightPhase('loading');
      try {
        const base = [
          ...root.querySelectorAll<HTMLImageElement>(
            '.meridian-schematic__base img',
          ),
        ].find((image) => image.complete && image.naturalWidth > 0);
        const first = root.querySelector<HTMLImageElement>(
          '.meridian-schematic__base img',
        );
        const canvas = phone
          ? document.createElement('canvas')
          : canvasRef.current;
        if (!(base ?? first) || !canvas)
          throw new Error('The bay has no stage to light.');
        await (base ?? first)?.decode();
        const { bayLightMark, createLight } = await import('./light');
        setLightMark(bayLightMark());
        if (cancelled) return;
        const light = await createLight({
          base: (base ?? first) as HTMLImageElement,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches,
        });
        if (cancelled) {
          await light.dispose();
          return;
        }
        lightRef.current = light;
        light.source.update(shipView(viewInput(modelRef.current)).light);
        // Before attach(): a still scene renders one frame, and the canvas
        // holds it only inside this callback.
        if (phone) stopFrames = light.view.onFrame(() => mirror.frame(canvas));
        unsubscribe = light.view.onStatus((status) => {
          if (status === 'lost') {
            losses += 1;
            hide();
            if (losses === 1) {
              timer = setTimeout(() => {
                light.view
                  .attach(canvas)
                  .then(show)
                  .catch(() => setLightPhase('failed'));
              }, 2000);
            } else {
              setLightPhase('failed');
            }
          } else {
            clearTimeout(timer);
            if (losses < 2) show();
          }
        });
        await light.view.attach(canvas);
        if (cancelled) return;
        setLightPhase('on');
        show();
      } catch {
        if (!cancelled) {
          hide();
          setLightPhase('failed');
        }
      }
    };
    const near = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
          )
        )
          return;
        near.disconnect();
        const idle = window.requestIdleCallback
          ? (run: () => void) =>
              window.requestIdleCallback(run, { timeout: 2000 })
          : (run: () => void) => window.setTimeout(run, 200);
        idle(() => {
          if (!cancelled) void start();
        });
      },
      { threshold: [0.5] },
    );
    near.observe(root);
    return () => {
      cancelled = true;
      near.disconnect();
      clearTimeout(timer);
      unsubscribe?.();
      stopFrames?.();
      const light = lightRef.current;
      lightRef.current = null;
      setLit(false);
      setLightPhase('off');
      light?.view.detach();
      void light?.dispose();
    };
  }, [mirror, model.phone]);

  /** The 2D canvas of a run on a phone: its crop of the lit scene. */
  const runRefs = useMemo(
    () =>
      [0, 1].map(
        (run) => (element: HTMLCanvasElement | null) =>
          mirror.register(run, element),
      ),
    [mirror],
  );
  const runCanvas = (run: number) => (
    <canvas
      ref={runRefs[run]}
      className="nexus-bay__canvas"
      aria-hidden="true"
    />
  );

  const failed = model.check !== null && !model.check.ok;
  const locked = failed
    ? 'Launch is locked until the check passes'
    : model.check === null
      ? 'Running pre-flight'
      : null;
  const lastRunFailed =
    model.launch === 'failed' || model.outcome?.lookup != null;
  const status =
    model.check === null
      ? 'running'
      : failed || lastRunFailed
        ? 'alarm'
        : 'nominal';
  return (
    <div
      ref={rootRef}
      data-runtime={runtimeMark ?? 'pending'}
      data-bay-mark={BAY_MARK}
      data-light={lightPhase}
      data-light-mark={lightMark ?? undefined}
    >
      <BayView
        markup={markup}
        layout={model.phone ? 'phone' : 'wide'}
        view={view}
        state={model.state}
        section={model.section}
        log={model.log}
        tab={model.tab}
        source={SOURCE}
        status={status}
        exit={model.exit}
        errorsOn={model.errorsOn}
        launchLabel={
          model.launch === 'running'
            ? 'Launching'
            : model.launchedOnce
              ? 'Relaunch'
              : 'Launch'
        }
        locked={locked}
        launching={model.launch === 'running'}
        checkWord={model.check?.ok ? 'Check passed' : 'Running pre-flight'}
        caption={
          model.launch === 'launched' || model.launch === 'failed'
            ? captionOf(model.outcome)
            : null
        }
        levels={model.levels}
        currentLevel={model.currentLevel}
        hint={model.interacted ? null : 'conduit-Tactical-Comms'}
        hover={model.hover}
        outline={model.outline}
        graph={model.graph}
        showGraph={model.showGraph}
        acknowledged={model.acknowledged}
        announce={model.announce}
        width={{ wide: model.width, phone: model.width }}
        coarse={model.coarse}
        actions={actions}
        errorPages={initial.errorPages}
        light={{
          canvas: (
            <canvas
              ref={canvasRef}
              className="nexus-bay__canvas"
              aria-hidden="true"
            />
          ),
          runCanvas,
          lit,
        }}
      />
    </div>
  );
}

function viewInput(model: Model) {
  return {
    state: model.state,
    power: model.power,
    check: model.check,
    startupError:
      model.launch === 'failed' && model.outcome && !model.outcome.ok
        ? model.outcome.error
        : null,
    lookupError: model.outcome?.lookup?.error ?? null,
    online: model.online,
    linked: model.linked,
  };
}
