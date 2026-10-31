import { beforeEach, describe, expect, it, vi } from 'vitest';

const add = vi.fn();

vi.mock('pixi.js', () => ({
  BlendModeFilter: class {},
  ExtensionType: { BlendMode: 'blend-mode' },
  extensions: { add },
}));

beforeEach(() => {
  add.mockClear();
  vi.resetModules();
});

describe('the modulate blend', () => {
  it('names the blend that the light sprite takes', async () => {
    const { MODULATE_2X } = await import('./modulate-blend.js');
    expect(MODULATE_2X).toBe('modulate-2x');
  });

  it('registers one extension of that name with Pixi', async () => {
    const { MODULATE_2X, registerModulateBlend } =
      await import('./modulate-blend.js');
    registerModulateBlend();
    expect(add).toHaveBeenCalledOnce();
    const [blend] = add.mock.calls[0] as [
      { extension: { name: string; type: string } },
    ];
    expect(blend.extension).toEqual({ name: MODULATE_2X, type: 'blend-mode' });
  });

  it('does nothing on a second call', async () => {
    const { registerModulateBlend } = await import('./modulate-blend.js');
    registerModulateBlend();
    registerModulateBlend();
    expect(add).toHaveBeenCalledOnce();
  });
});
