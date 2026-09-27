/** A two-way line to the other player. Real games use WebRTC; tests use an in-memory pair. */
export interface Transport {
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}

/** Two transports wired to each other, delivering asynchronously like a real connection. */
export function memoryPair(): [Transport, Transport] {
  const make = () => {
    let receive: (message: unknown) => void = () => undefined;
    let closed: () => void = () => undefined;
    let other: ReturnType<typeof make> | null = null;
    let open = true;
    const transport: Transport & { link(o: ReturnType<typeof make>): void; deliver(m: unknown): void; ended(): void } = {
      send: (message) => {
        if (!open) return;
        const copy = JSON.parse(JSON.stringify(message));
        queueMicrotask(() => other?.deliver(copy));
      },
      onMessage: (handler) => {
        receive = handler;
      },
      onClose: (handler) => {
        closed = handler;
      },
      close: () => {
        if (!open) return;
        open = false;
        queueMicrotask(() => other?.ended());
      },
      link: (o) => {
        other = o;
      },
      deliver: (m) => receive(m),
      ended: () => {
        open = false;
        closed();
      },
    };
    return transport;
  };
  const a = make();
  const b = make();
  a.link(b);
  b.link(a);
  return [a, b];
}
