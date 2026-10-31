import { Filter, GlProgram, type TextureSource } from 'pixi.js';

/**
 * The vertex shader of Pixi's default filter, with the quad's 0 to 1 position
 * passed on, so the fragment can find its pixel of the frame.
 */
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFramePosition;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vFramePosition = aPosition;
}
`;

/**
 * Keeps the pixels whose frame position holds the room's index in the room
 * mask. `uBounds` is the container's filter area in pixels of the frame, so
 * the quad's position maps to a pixel of the mask.
 */
const fragment = `
in vec2 vTextureCoord;
in vec2 vFramePosition;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform vec4 uBounds;
uniform vec2 uMaskSize;
uniform float uIndex;

void main(void) {
  vec2 pixel = uBounds.xy + vFramePosition * uBounds.zw;
  float index = texture(uMask, pixel / uMaskSize).r * 255.0;
  float inside = step(abs(index - uIndex), 0.5);
  finalColor = texture(uTexture, vTextureCoord) * inside;
}
`;

export interface RoomClipOptions {
  /** The room mask: 8-bit grey, the room's index in each of its pixels. */
  readonly mask: TextureSource;
  readonly index: number;
  /** The container's filter area: `[left, top, right, bottom]` in pixels of the frame. */
  readonly bounds: readonly [number, number, number, number];
  readonly width: number;
  readonly height: number;
  /** `add` for a pass that lights what it draws over. */
  readonly blendMode?: 'add' | 'normal';
}

/** A filter that clips its container to one room of the room mask. */
export function createRoomClip(options: RoomClipOptions): Filter {
  const [left, top, right, bottom] = options.bounds;
  return new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'room-clip' }),
    resources: {
      uMask: options.mask,
      clipUniforms: {
        uBounds: {
          value: new Float32Array([left, top, right - left, bottom - top]),
          type: 'vec4<f32>',
        },
        uMaskSize: {
          value: new Float32Array([options.width, options.height]),
          type: 'vec2<f32>',
        },
        uIndex: { value: options.index, type: 'f32' },
      },
    },
    blendMode: options.blendMode ?? 'normal',
    resolution: 1,
    clipToViewport: false,
  });
}
