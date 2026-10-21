/**
 * A stand-in for the browser's EventSource. Tests put the class on
 * `globalThis` and read `FakeEventSource.opened` to see which sources the
 * code opened and whether it closed them.
 */
export class FakeEventSource extends EventTarget {
  static opened: FakeEventSource[] = [];
  closed = false;
  constructor(readonly url: string) {
    super();
    FakeEventSource.opened.push(this);
  }
  close() {
    this.closed = true;
  }
  /** Dispatches a server-sent event of type `type` with `data`. */
  emit(type: string, data: string) {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }
}
