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
  ALARM_GLOW,
  ALARM_PEAK,
  DEFAULT_RAMP_MS,
  GLOW_GAIN,
  LAMP_GAIN,
  LightModel,
  hexToInt,
  lightLevel,
  radialPixels,
  spriteSize,
  tintOf,
} from './light-math.js';
import { loadMask, type LoadedMask } from './mask-source.js';
import { MODULATE_2X } from './modulate-blend.js';
import { createRoomClip } from './room-clip.js';

/** The light texture renders at half the frame (map runtime 4.9). */
const LIGHT_SCALE = 0.5;
const RADIAL_SIZE = 128;
/** Below this level the layer hides the sprite. */
const VISIBLE = 0.002;

interface LitLight {
  readonly light: DeckLight;
  readonly sprite: Sprite;
  /** The lit housing of a light that names a fixture, which follows that fixture's level. */
  readonly housing: Sprite | undefined;
}

interface LitRoom {
  readonly id: string;
  readonly ambient: Sprite;
  readonly lights: readonly LitLight[];
  /** The alarm light, in two sprites since one cannot pass its own full alpha. */
  readonly alarm: readonly [Sprite, Sprite];
  /** The alarm's glow in the housing pass, which adds red over the base. */
  readonly alarmGlow: Sprite;
  /** The room's clipped housing pass: the lamp mask and the housings that follow a fixture. */
  readonly emissive: Container;
  /** The lamp mask's container inside `emissive`, whose level is the room's lamp level. */
  readonly lamps: Container;
}

/** A grey at `level` of the light texture's range, where 0.5 leaves the base as it is. */
const grey = (level: number): number =>
  Math.round(Math.min(1, Math.max(0, level)) * 255) * 0x010101;

/**
 * The light (design system 8.2, architect section 5). It renders a
 * half-resolution light texture that starts at 0.5 grey, the level that leaves
 * the base as it is. Each room draws its
 * ambient fill and its additive light sprites into a container that a
 * `RoomClip` filter cuts to the room's index in the room mask, so no light
 * crosses a wall. The texture modulates the base (`base * light * 2`), so a
 * lamp can warm a room and the alarm can turn it red, and the emissive mask
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
  private owned: Texture[] = [];
  private masks: LoadedMask[] = [];
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
    const loaded = await Promise.allSettled([
      loadMask(scene.masks.rooms),
      loadMask(scene.masks.emissive),
    ]);
    const masks = loaded.flatMap((each) =>
      each.status === 'fulfilled' ? [each.value] : [],
    );
    const failed = loaded.find((each) => each.status === 'rejected');
    if (failed !== undefined || context.signal.aborted) {
      for (const mask of masks) mask.dispose();
      if (failed !== undefined) throw failed.reason;
      context.signal.throwIfAborted();
    }
    const [roomMask, emissiveMask] = masks as [LoadedMask, LoadedMask];
    this.masks = masks;

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
          mask: roomMask.texture.source,
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
      const housing = new Container();
      housing.filterArea = area;
      housing.filters = [clip('add')];
      const mask = new Sprite(emissiveMask.texture);
      mask.width = width;
      mask.height = height;
      mask.tint = hexToInt(this.options.palette.glow);
      const lamps = new Container();
      lamps.addChild(mask);
      housing.addChild(lamps);
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
        let box: Sprite | undefined;
        if (light.fixture !== null) {
          // A housing that follows a fixture has no place in the lamp mask.
          const [left, top, right, bottom] = light.box;
          box = new Sprite(Texture.WHITE);
          box.position.set(Math.floor(left), Math.floor(top));
          box.width = Math.max(1, Math.ceil(right) - Math.floor(left));
          box.height = Math.max(1, Math.ceil(bottom) - Math.floor(top));
          box.tint = hexToInt(this.options.palette.glow);
          housing.addChild(box);
        }
        lit.push({ light, sprite, housing: box });
      }

      const alarmSprite = () => {
        const sprite = new Sprite(glow);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        sprite.tint = hexToInt(this.options.palette.alarm);
        sprite.width = area.width * 1.4;
        sprite.height = area.height * 1.8;
        sprite.position.set(area.x + area.width / 2, area.y + area.height / 2);
        return sprite;
      };
      const alarm: [Sprite, Sprite] = [alarmSprite(), alarmSprite()];
      node.addChild(...alarm);
      lightRoot.addChild(node);

      // The same light again in the additive pass, so the red shows over the base itself.
      const alarmGlow = alarmSprite();
      housing.addChild(alarmGlow);

      emissive.addChild(housing);

      rooms.push({
        id,
        ambient,
        lights: lit,
        alarm,
        alarmGlow,
        emissive: housing,
        lamps,
      });
    }

    const texture = RenderTexture.create({
      width: Math.round(width * LIGHT_SCALE),
      height: Math.round(height * LIGHT_SCALE),
      resolution: 1,
    });
    const light = new Sprite(texture);
    light.scale.set(1 / LIGHT_SCALE);
    light.blendMode = MODULATE_2X;
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
      clearColor: 0x808080,
    });
  }

  unmount(): void {
    this.stopListening?.();
    this.stopListening = undefined;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lightRoot?.destroy({ children: true });
    this.lightTexture?.destroy(true);
    for (const each of this.owned) each.destroy(true);
    this.owned = [];
    for (const mask of this.masks) mask.dispose();
    this.masks = [];
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
      const peak = levels.alarm * ALARM_PEAK;
      room.alarm[0].alpha = Math.min(1, peak);
      room.alarm[0].visible = peak > VISIBLE;
      room.alarm[1].alpha = Math.max(0, peak - 1);
      room.alarm[1].visible = peak - 1 > VISIBLE;
      room.alarmGlow.alpha = levels.alarm * ALARM_GLOW;
      room.alarmGlow.visible = room.alarmGlow.alpha > VISIBLE;
      room.lamps.alpha = levels.lamp;
      room.lamps.visible = levels.lamp > VISIBLE;
      let housed = room.lamps.visible || room.alarmGlow.visible;
      for (const { light, sprite, housing } of room.lights) {
        const fixture =
          light.fixture === null
            ? undefined
            : model.fixture(light.fixture, now);
        const level = lightLevel(light, levels, fixture) * light.gain;
        sprite.alpha = level * (light.fixture === null ? LAMP_GAIN : GLOW_GAIN);
        sprite.visible = sprite.alpha > VISIBLE;
        if (housing !== undefined) {
          housing.alpha = level * light.housing;
          housing.visible = housing.alpha > VISIBLE;
          housed ||= housing.visible;
        }
      }
      room.emissive.visible = housed;
    }
  }
}
