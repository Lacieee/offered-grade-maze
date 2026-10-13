/**
 * Ordered door-crossing reports (CP08 T2). Rendering never waits for it: crossings are
 * queued and sent strictly in order, one request in flight, retried with backoff while the
 * game runs.
 */
import type { DoorId, RoomDTO, RoomId } from '@ogm/shared';
import { desyncInfo, isRetryable, type GameApi } from './api.js';

/** One queued crossing. */
export interface QueuedTransition {
  seq: number;
  from: RoomId;
  door: DoorId;
  clientElapsedMs: number;
}

/** Retry delays: 0.5 s, 1 s, 2 s … at most 8 s. */
export function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** Math.max(0, attempt - 1));
}

/** Show the "Reconnecting…" badge after requests have been failing for this long (ms). */
export const RECONNECTING_AFTER_MS = 3000;

export interface TransitionQueueDeps {
  api: GameApi;
  gameId: string;
  /** Rooms the server sent with an accepted crossing. */
  onRooms(rooms: RoomDTO[]): void;
  /** A crossing was accepted (after `onRooms`). */
  onAccepted?(t: QueuedTransition, current: RoomId): void;
  /** The server rejected a crossing as `desync`; it is dropped and the queue continues. */
  onDesync(t: QueuedTransition, server: { current: RoomId; lastSeq: number } | null): void;
  /** Whether the "Reconnecting…" badge should show. */
  onReconnecting(reconnecting: boolean): void;
  /** Nothing is sent before this resolves (the game's `/start`). */
  ready?: Promise<unknown>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  setTimer?: (cb: () => void, ms: number) => () => void;
}

export class TransitionQueue {
  private readonly items: QueuedTransition[] = [];
  private nextSeq = 1;
  /** The server's `last_seq` as far as the client knows. */
  private serverSeq = 0;
  private running = false;
  private stopped = false;
  private failingSince: number | null = null;
  private reconnecting = false;
  private cancelBadgeTimer: (() => void) | null = null;
  private waiters: (() => void)[] = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly setTimer: (cb: () => void, ms: number) => () => void;

  constructor(private readonly deps: TransitionQueueDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.sleep =
      deps.sleep ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.setTimer =
      deps.setTimer ??
      ((cb, ms) => {
        const id = setTimeout(cb, ms);
        return () => {
          clearTimeout(id);
        };
      });
  }

  /** Crossings queued or in flight. */
  get pending(): number {
    return this.items.length;
  }

  /**
   * The server's `last_seq` as far as the client knows (last accepted crossing): the
   * `lastSeq` to send with `/complete` once {@link flush} resolved.
   */
  get lastSeq(): number {
    return this.serverSeq;
  }

  /** Queues one crossing; returns it. */
  enqueue(from: RoomId, door: DoorId, clientElapsedMs: number): QueuedTransition {
    const t = {
      seq: this.nextSeq++,
      from,
      door,
      clientElapsedMs: Math.max(0, Math.round(clientElapsedMs)),
    };
    this.items.push(t);
    void this.run();
    return t;
  }

  /** Resolves when every queued crossing has been sent. */
  flush(): Promise<void> {
    if (this.items.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Stops sending (game over or abandoned). Pending flushes never resolve. */
  stop(): void {
    this.stopped = true;
    this.cancelBadgeTimer?.();
    this.setReconnecting(false);
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      try {
        await this.deps.ready;
      } catch {
        // The game could not be started: nothing can be sent.
        this.stopped = true;
        return;
      }
      let attempt = 0;
      while (!this.isStopped() && this.items.length > 0) {
        const t = this.items[0];
        if (t === undefined) break;
        try {
          const r = await this.deps.api.transition(this.deps.gameId, t);
          this.succeeded();
          attempt = 0;
          this.items.shift();
          this.serverSeq = t.seq;
          if (r.rooms.length > 0) this.deps.onRooms(r.rooms);
          this.deps.onAccepted?.(t, r.current);
        } catch (err) {
          const desync = desyncInfo(err);
          if (desync !== null || (err instanceof Error && !isRetryable(err))) {
            // Rejected for good: drop it and carry on (the server flagged the game).
            this.succeeded();
            attempt = 0;
            this.items.shift();
            // Continue numbering from the server's last_seq, so later crossings are not
            // rejected for a gap.
            this.serverSeq = desync?.lastSeq ?? this.serverSeq;
            this.renumber();
            this.deps.onDesync(t, desync);
            continue;
          }
          this.failed();
          attempt++;
          await this.sleep(backoffMs(attempt));
        }
      }
    } finally {
      this.running = false;
    }
    if (this.items.length === 0) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w();
    }
  }

  /** A method, so loops re-read the flag that `stop()` sets meanwhile. */
  private isStopped(): boolean {
    return this.stopped;
  }

  private renumber(): void {
    let seq = this.serverSeq;
    for (const item of this.items) item.seq = ++seq;
    this.nextSeq = seq + 1;
  }

  private failed(): void {
    if (this.failingSince !== null) return;
    this.failingSince = this.now();
    this.cancelBadgeTimer = this.setTimer(() => {
      this.cancelBadgeTimer = null;
      if (this.failingSince !== null && !this.stopped) this.setReconnecting(true);
    }, RECONNECTING_AFTER_MS);
  }

  private succeeded(): void {
    this.failingSince = null;
    this.cancelBadgeTimer?.();
    this.cancelBadgeTimer = null;
    this.setReconnecting(false);
  }

  private setReconnecting(on: boolean): void {
    if (on === this.reconnecting) return;
    this.reconnecting = on;
    this.deps.onReconnecting(on);
  }
}
