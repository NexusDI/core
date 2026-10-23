// Exposed by the federation plugin as 'federation-life-support/section'.
// Consumers render it lazily via `lazyProvider('federation-life-support', 'section')`.
export function Section() {
  return (
    <section data-testid="federation-life-support">
      <h1>Hello from federation-life-support</h1>
    </section>
  );
}

export default Section;
