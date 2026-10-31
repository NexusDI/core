import { ImageSource, Texture } from 'pixi.js';

/** A mask texture and the way to free it and the bitmap behind it. */
export interface LoadedMask {
  readonly texture: Texture;
  dispose(): void;
}

/**
 * Loads an 8-bit grey mask as a texture that keeps its values: no colour
 * conversion, no premultiplying, nearest sampling and no mipmaps, so the red
 * channel times 255 is the pixel's index.
 */
export async function loadMask(url: string): Promise<LoadedMask> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The mask ${url} did not load: ${response.status}.`);
  }
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const texture = new Texture({
    source: new ImageSource({
      resource: bitmap,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
    }),
  });
  return {
    texture,
    dispose() {
      texture.destroy(true);
      bitmap.close();
    },
  };
}
