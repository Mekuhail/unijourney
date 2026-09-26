type Handler = (payload?: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export const bus = {
  on(topic: string, fn: Handler): () => void {
    if (!handlers.has(topic)) handlers.set(topic, new Set());
    handlers.get(topic)!.add(fn);
    return () => {
      handlers.get(topic)?.delete(fn);
    };
  },
  emit(topic: string, payload?: unknown) {
    handlers.get(topic)?.forEach((fn) => fn(payload));
  }
};

/** Call after any mutation so lists, badges and the notification bell refresh. */
export function refreshAll(...topics: string[]) {
  bus.emit('refresh');
  for (const t of topics) bus.emit(t);
}
