/** The scale renderer of each documented library-variant (scale spec 4.2). */
import type { LibraryId, Variant } from '../../schema.ts';
import { renderInversify } from './inversify.ts';
import { renderNexusdi } from './nexusdi.ts';
import type { Renderer } from './shared.ts';

const RENDERERS: Readonly<Partial<Record<string, Renderer>>> = {
  'nexusdi/plain': renderNexusdi,
  'inversify/decorated': renderInversify,
};

export function rendererFor(library: LibraryId, variant: Variant): Renderer {
  const renderer = RENDERERS[`${library}/${variant}`];
  if (renderer === undefined)
    throw new Error(`no scale renderer for ${library} ${variant}`);
  return renderer;
}
