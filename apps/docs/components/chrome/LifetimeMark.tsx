import { Marker } from '@nexusdi/meridian-ui';

export type LifetimeName = 'singleton' | 'scoped' | 'transient' | 'none';

/**
 * A lifetime as its word plus a glyph, both in the `data` colour (design
 * system 4.6): a filled diamond for singleton, a half-filled one for scoped, an
 * outline one for transient and a dash for none. The glyph replaces the
 * hue the lifetimes had, so the four share one colour and differ in shape.
 */
export default function LifetimeMark({ of }: { of: LifetimeName }) {
  return (
    <span className="nexus-lifetime">
      <Marker shape="lifetime" lifetime={of} />
      {of}
    </span>
  );
}
