/** Call to remove a listener. */
export type Unsubscribe = () => void;

/** Minimal typed event emitter. `Events` maps event names to listener argument types. */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Adds a listener; returns a function that removes it. */
  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const fn = cb as (payload: never) => void;
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  /** Calls every listener of `event` with `payload`. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: Events[K]) => void)(payload);
  }

  /** Removes every listener. */
  clear(): void {
    this.listeners.clear();
  }
}
