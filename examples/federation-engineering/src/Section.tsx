// Exposed by the federation plugin as 'federation-engineering/section'.
// Consumers render it lazily via `lazyProvider('federation-engineering', 'section')`.
export function Section() {
  return (
    <section data-testid="federation-engineering">
      <h1>Hello from federation-engineering</h1>
    </section>
  );
}

export default Section;
