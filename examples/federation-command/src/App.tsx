// Exposed by the federation plugin as 'federation-command/App'.
// Consumers render it lazily via `lazyProvider('federation-command', 'App')`.
export function App() {
  return (
    <section data-testid="federation-command">
      <h1>Hello from federation-command</h1>
    </section>
  );
}

export default App;
