import { CROPS, FRAME, type SectionId } from './geometry';

/**
 * The phone's lit scene (TL31). One deck canvas draws the whole cutaway off
 * the page at the art's own scale, and each run of a hull section shows its
 * crop on a 2D canvas of its own. The deck view reports each frame it renders,
 * and the canvas holds that frame only inside the callback, so `frame()` copies
 * it into a snapshot at once. A crop paints from the snapshot whenever it
 * needs to: when a frame arrives, when the reader opens another section and
 * when the stage changes size, none of which renders a frame of its own.
 */

/** The deck's scale in pixels per metre: 2048 pixels over the frame's 80 m. */
export const DECK_PPM = 25.6;

/** The rectangle of the deck canvas that one run shows, in pixels. */
export function cropRect(
  section: SectionId,
  run: number,
): readonly [x: number, y: number, width: number, height: number] | null {
  const crop = CROPS[section];
  const span = crop.runs[run];
  if (span === undefined) return null;
  const [from, to] = span;
  return [
    (from - FRAME[0]) * DECK_PPM,
    (crop.y[0] - FRAME[1]) * DECK_PPM,
    (to - from) * DECK_PPM,
    (crop.y[1] - crop.y[0]) * DECK_PPM,
  ];
}

export class RunMirror {
  private snapshot: HTMLCanvasElement | null = null;
  private readonly runs = new Map<number, HTMLCanvasElement>();
  private section: SectionId = 'tactical';

  /** Whether a frame has arrived. */
  get ready(): boolean {
    return this.snapshot !== null;
  }

  /** Copies the frame that `deck` holds now. Call it inside the frame callback. */
  frame(deck: HTMLCanvasElement): void {
    this.snapshot ??= Object.assign(document.createElement('canvas'), {
      width: deck.width,
      height: deck.height,
    });
    this.snapshot.getContext('2d')?.drawImage(deck, 0, 0);
    this.paint();
  }

  /** Registers the 2D canvas of a run, or forgets it when `canvas` is null. */
  register(run: number, canvas: HTMLCanvasElement | null): void {
    if (canvas === null) {
      this.runs.delete(run);
      return;
    }
    this.runs.set(run, canvas);
    this.paint();
  }

  /** Names the hull section whose runs are on screen, and paints them. */
  show(section: SectionId): void {
    this.section = section;
    this.paint();
  }

  /** Paints every registered run from the snapshot, at the pixel size it shows at. */
  paint(): void {
    const { snapshot } = this;
    if (snapshot === null) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const [run, canvas] of this.runs) {
      const rect = cropRect(this.section, run);
      const context = canvas.getContext('2d');
      if (rect === null || context === null) continue;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(snapshot, ...rect, 0, 0, width, height);
    }
  }
}
