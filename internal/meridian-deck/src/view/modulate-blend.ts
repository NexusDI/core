import { BlendModeFilter, ExtensionType, extensions } from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';

/**
 * The blend of the light texture over the base: `base * light * 2`. A light
 * value of 0.5 leaves the base as it is, below it darkens, and above it
 * brightens and tints, which a plain multiply cannot do. Pixi runs a blend
 * mode that a filter implements by reading what is already drawn, so the
 * light sprite takes this name as its `blendMode`.
 */
export const MODULATE_2X = 'modulate-2x' as BLEND_MODES;

class Modulate2x extends BlendModeFilter {
  static extension = {
    name: MODULATE_2X,
    type: ExtensionType.BlendMode,
  };

  constructor() {
    super({
      gl: {
        functions: '',
        main: 'finalColor = vec4(back.rgb * front.rgb * 2.0, blendedAlpha) * uBlend;',
      },
      gpu: {
        functions: '',
        main: 'out = vec4<f32>(back.rgb * front.rgb * 2.0, blendedAlpha) * blendUniforms.uBlend;',
      },
    });
  }
}

/**
 * Registers the blend with Pixi, once. The renderer's blend pipe looks the name
 * up when it draws, so a call before `init()` is enough. A function and not a
 * bare import, since the package declares no side effects and a bundler would
 * drop the import.
 */
export function registerModulateBlend(): void {
  if (!registered) extensions.add(Modulate2x);
  registered = true;
}

let registered = false;
