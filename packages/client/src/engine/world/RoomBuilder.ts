/**
 * Background room building (CP08 T4): incoming rooms are built one per idle slot, nearest to
 * the player first, so streaming never causes a long frame.
 */
import type { RoomDTO, RoomId } from '@ogm/shared';
import { hopDistances } from './reach.js';

/** Schedules `cb` when the browser is idle; returns a cancel function. */
export type IdleScheduler = (
  cb: (deadline: { timeRemaining(): number; didTimeout: boolean }) => void,
) => () => void;

/** Time a build needs to be left in an idle slot (ms) before it starts there. */
export const BUILD_BUDGET_MS = 4;

/**
 * `requestIdleCallback` with a 100 ms timeout (so building also progresses under load), or
 * `setTimeout(0)` where it is missing (Safari).
 */
export const browserIdle: IdleScheduler = (cb) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(cb, { timeout: 100 });
    return () => {
      cancelIdleCallback(id);
    };
  }
  const id = setTimeout(() => {
    cb({ timeRemaining: () => BUILD_BUDGET_MS, didTimeout: true });
  }, 0);
  return () => {
    clearTimeout(id);
  };
};

export interface RoomBuilderDeps {
  /** True if the room is built already. */
  isBuilt(id: RoomId): boolean;
  /** Builds (and compiles) one room. */
  build(dto: RoomDTO): void;
  /** Room the player is in (priority), and the DTOs known for links. */
  current(): RoomId | null;
  known(id: RoomId): Pick<RoomDTO, 'doors'> | undefined;
  idle?: IdleScheduler;
}

export class RoomBuilder {
  private readonly pending = new Map<RoomId, RoomDTO>();
  private cancel: (() => void) | null = null;
  private readonly idle: IdleScheduler;

  constructor(private readonly deps: RoomBuilderDeps) {
    this.idle = deps.idle ?? browserIdle;
  }

  /** Rooms waiting to be built. */
  get size(): number {
    return this.pending.size;
  }

  /** True if `id` is waiting to be built. */
  has(id: RoomId): boolean {
    return this.pending.has(id);
  }

  /** The DTO of a waiting room. */
  get(id: RoomId): RoomDTO | undefined {
    return this.pending.get(id);
  }

  /** Queues rooms that are neither built nor queued. */
  enqueue(dtos: readonly RoomDTO[]): void {
    for (const dto of dtos) {
      if (!this.deps.isBuilt(dto.id) && !this.pending.has(dto.id)) this.pending.set(dto.id, dto);
    }
    this.schedule();
  }

  /** Builds every waiting room now (loading screen, tests). */
  drain(): void {
    while (this.buildNext()) {
      /* keep building */
    }
  }

  /** Drops every waiting room and the scheduled slot. */
  clear(): void {
    this.cancel?.();
    this.cancel = null;
    this.pending.clear();
  }

  private schedule(): void {
    if (this.cancel !== null || this.pending.size === 0) return;
    this.cancel = this.idle((deadline) => {
      this.cancel = null;
      // At most one room per slot, and only with enough time left (or when overdue).
      if (deadline.didTimeout || deadline.timeRemaining() >= BUILD_BUDGET_MS) this.buildNext();
      this.schedule();
    });
  }

  /** Builds the waiting room nearest to the player. Returns false if none was waiting. */
  private buildNext(): boolean {
    if (this.pending.size === 0) return false;
    const next = this.nearest();
    if (next === undefined) return false;
    this.pending.delete(next.id);
    if (!this.deps.isBuilt(next.id)) this.deps.build(next);
    return true;
  }

  private nearest(): RoomDTO | undefined {
    const current = this.deps.current();
    let best: RoomDTO | undefined;
    let bestDist = Infinity;
    if (current !== null) {
      const dist = hopDistances(
        { get: (id) => this.pending.get(id) ?? this.deps.known(id) },
        current,
        8,
      );
      for (const [id, dto] of this.pending) {
        const d = dist.get(id) ?? Infinity;
        if (d < bestDist || (d === bestDist && best !== undefined && id < best.id)) {
          best = dto;
          bestDist = d;
        }
      }
    }
    return best ?? [...this.pending.values()].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  }
}
