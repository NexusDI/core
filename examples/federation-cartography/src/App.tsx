// Exposed by the federation plugin as 'federation-cartography/App'.
// Consumers render it lazily via `lazyProvider('federation-cartography', 'App')`.
export function App() {
  return (
    <section data-testid="federation-cartography">
      <h1>Hello from federation-cartography</h1>
    </section>
  );
}

export default App;
