import { ImageSource, Sprite, Texture } from 'pixi.js';

import type { DeckImage } from '../state/contracts.js';

import type { IDeckLayer, LayerContext } from './contracts.js';

/** Resolves once the image has decoded. An `ImageBitmap` has. */
async function decoded(image: DeckImage): Promise<DeckImage> {
  if ('decode' in image && !image.complete) await image.decode();
  return image;
}

/**
 * The unlit cutaway. The layer uploads the image the app hands it, a decoded
 * bitmap at the size of its file or an image element, so the view never
 * downloads the base itself.
 */
export class BaseLayer implements IDeckLayer {
  private sprite: Sprite | undefined;

  async mount({ slot, scene, signal }: LayerContext): Promise<void> {
    const image = await decoded(scene.base);
    signal.throwIfAborted();
    const texture = new Texture({
      source: new ImageSource({ resource: image, autoGenerateMipmaps: false }),
    });
    const sprite = new Sprite(texture);
    sprite.width = scene.legend.size.width;
    sprite.height = scene.legend.size.height;
    slot.addChild(sprite);
    this.sprite = sprite;
  }

  unmount(): void {
    this.sprite?.destroy({ texture: true, textureSource: true });
    this.sprite = undefined;
  }
}
