import {
  BufferImageSource,
  Container,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from 'pixi.js';

import type {
  DeckChange,
  DeckLight,
  DeckOptions,
  IDeckState,
} from '../state/contracts.js';
import { DECK_OPTIONS, DECK_STATE } from '../state/tokens.js';

import type { IDeckLayer, LayerContext } from './contracts.js';
import {
  DEFAULT_RAMP_MS,
  LAMP_GAIN,
  LightModel,
  hexToInt,
  kindGain,
  lightLevel,
  radialPixels,
  spriteSize,
  tintOf,
} from './light-math.js';
import { loadMask } from './mask-source.js';
import { createRoomClip } from './room-clip.js';

/** The light texture renders at half the frame (map runtime 4.9). */
const LIGHT_SCALE = 0.5;
const RADIAL_SIZE = 128;
/** Below this level a sprite is hidden rather than drawn. */
const VISIBLE = 0.002;

interface LitLight {
  readonly light: DeckLight;
  readonly sprite: Sprite;
}

interface LitRoom {
  readonly id: string;
  readonly ambient: Sprite;
  readonly lights: readonly LitLight[];
  readonly alarm: Sprite;
  readonly emissive: Container;
}

const grey = (level: number): number =>
  Math.round(Math.min(1, Math.max(0, level)) * 255) * 0x010101;

/**
 * The light (design system 8.2, architect section 5). It renders a
 * half-resolution light texture that starts white. Each room draws its
 * ambient fill and its additive light sprites into a container that a
 * `RoomClip` filter cuts to the room's index in the room mask, so no light
 * crosses a wall. The texture multiplies over the base, and the emissive mask
 * adds the lit housings in the glow colour.
 *
 * The layer has its own frame loop, which runs only while a ramp moves or an
 * alarm pulses.
 */
export class LightLayer implements IDeckLayer {
  static deps = [DECK_STATE, DECK_OPTIONS] as const;

  private context: LayerContext | undefined;
  private model: LightModel | undefined;
  private rooms: LitRoom[] = [];
  private lightRoot: Container | undefined;
  private lightTexture: RenderTexture | undefined;
  private owned: { destroy(): void }[] = [];
  private stopListening: (() => void) | undefined;
  private frame = 0;

  constructor(
    private readonly state: IDeckState,
    private readonly options: DeckOptions,
  ) {}

  async mount(context: LayerContext): Promise<void> {
    const { scene, slot } = context;
    const { legend, lights } = scene;
    const { width, height } = legend.size;
    const [roomMask, emissiveMask] = await Promise.all([
      loadMask(scene.masks.rooms),
      loadMask(scene.masks.emissive),
    ]);
    this.owned.push(roomMask, emissiveMask);

    const glow = new Texture({
      source: new BufferImageSource({
        resource: radialPixels(RADIAL_SIZE),
        width: RADIAL_SIZE,
        height: RADIAL_SIZE,
        alphaMode: 'premultiplied-alpha',
      }),
    });
    this.owned.push(glow);

    const lightRoot = new Container();
    lightRoot.scale.set(LIGHT_SCALE);
    const emissive = new Container();
    const rooms: LitRoom[] = [];
    for (const [id, index] of Object.entries(legend.rooms)) {
      const bounds = legend.bounds[id];
      if (bounds === undefined) continue;
      const area = new Rectangle(
        bounds[0],
        bounds[1],
        bounds[2] - bounds[0],
        bounds[3] - bounds[1],
      );
      const clip = (blendMode: 'add' | 'normal') =>
        createRoomClip({
          mask: roomMask.source,
          index,
          bounds,
          width,
          height,
          blendMode,
        });

      const node = new Container();
      node.filterArea = area;
      node.filters = [clip('normal')];
      const ambient = new Sprite(Texture.WHITE);
      ambient.position.set(area.x, area.y);
      ambient.width = area.width;
      ambient.height = area.height;
      node.addChild(ambient);

      const lit: LitLight[] = [];
      for (const light of lights) {
        if (light.room !== id) continue;
        const sprite = new Sprite(glow);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        sprite.tint = tintOf(light.colour, this.options.palette);
        const size = spriteSize(light);
        sprite.width = size.width;
        sprite.height = size.height;
        sprite.position.set(light.centre[0], light.centre[1]);
        node.addChild(sprite);
        lit.push({ light, sprite });
      }

      const alarm = new Sprite(glow);
      alarm.anchor.set(0.5);
      alarm.blendMode = 'add';
      alarm.tint = hexToInt(this.options.palette.alarm);
      alarm.width = area.width * 1.4;
      alarm.height = area.height * 1.8;
      alarm.position.set(area.x + area.width / 2, area.y + area.height / 2);
      node.addChild(alarm);
      lightRoot.addChild(node);

      const housing = new Container();
      housing.filterArea = area;
      housing.filters = [clip('add')];
      const mask = new Sprite(emissiveMask);
      mask.width = width;
      mask.height = height;
      mask.tint = hexToInt(this.options.palette.glow);
      housing.addChild(mask);
      emissive.addChild(housing);

      rooms.push({ id, ambient, lights: lit, alarm, emissive: housing });
    }

    const texture = RenderTexture.create({
      width: Math.round(width * LIGHT_SCALE),
      height: Math.round(height * LIGHT_SCALE),
      resolution: 1,
    });
    const light = new Sprite(texture);
    light.scale.set(1 / LIGHT_SCALE);
    light.blendMode = 'multiply';
    slot.addChild(light, emissive);

    this.context = context;
    this.rooms = rooms;
    this.lightRoot = lightRoot;
    this.lightTexture = texture;
    this.model = new LightModel(
      rooms.map((room) => room.id),
      lights.flatMap((each) => (each.fixture === null ? [] : [each.fixture])),
      this.options.reducedMotion,
      this.options.rampMs ?? DEFAULT_RAMP_MS,
    );

    const now = performance.now();
    const snapshot = this.state.snapshot();
    this.model.apply(
      {
        patch: { ...snapshot, ramp: { delay: 0, duration: 0 } },
        snapshot,
      },
      now,
    );
    this.stopListening = this.state.subscribe((change) => this.change(change));
    this.update(now);
    context.render();
    this.schedule();
  }

  /** Writes the levels of the moment into the sprites and draws the light texture. */
  prepare(): void {
    const { context, lightRoot, lightTexture } = this;
    if (!context || !lightRoot || !lightTexture) return;
    this.update(performance.now());
    context.renderer.render({
      container: lightRoot,
      target: lightTexture,
      clear: true,
      clearColor: 0xffffff,
    });
  }

  unmount(): void {
    this.stopListening?.();
    this.stopListening = undefined;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lightRoot?.destroy({ children: true });
    this.lightTexture?.destroy(true);
    for (const each of this.owned) each.destroy();
    this.owned = [];
    this.rooms = [];
    this.lightRoot = undefined;
    this.lightTexture = undefined;
    this.model = undefined;
    this.context = undefined;
  }

  private change(change: DeckChange): void {
    this.model?.apply(change, performance.now());
    this.schedule();
  }

  /** Asks for one frame. The frame asks for the next while something animates. */
  private schedule(): void {
    if (this.frame !== 0 || this.context === undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.context?.render();
      if (this.model?.animating(performance.now())) this.schedule();
    });
  }

  private update(now: number): void {
    const model = this.model;
    if (model === undefined) return;
    for (const room of this.rooms) {
      const levels = model.room(room.id, now);
      if (levels === undefined) continue;
      room.ambient.tint = grey(levels.ambient);
      room.alarm.alpha = levels.alarm;
      room.alarm.visible = levels.alarm > VISIBLE;
      room.emissive.alpha = levels.lamp;
      room.emissive.visible = levels.lamp > VISIBLE;
      for (const { light, sprite } of room.lights) {
        const fixture =
          light.fixture === null
            ? undefined
            : model.fixture(light.fixture, now);
        const level =
          lightLevel(light, levels, fixture) * kindGain(light.kind) * LAMP_GAIN;
        sprite.alpha = level;
        sprite.visible = level > VISIBLE;
      }
    }
  }
}
