import type { RoomDTO } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { RoomBuilder, type IdleScheduler } from './RoomBuilder.js';
import { hopDistances, missingWithin } from './reach.js';

/** Rooms in a line r00 → r01 → … → r05 (and back links). */
function line(n: number): Map<string, Pick<RoomDTO, 'id' | 'doors'>> {
  const rooms = new Map<string, Pick<RoomDTO, 'id' | 'doors'>>();
  for (let i = 0; i < n; i++) {
    const id = `r0${String(i)}`;
    const doors: RoomDTO['doors'] = [];
    if (i + 1 < n)
      doors.push({
        id: 'd0',
        wall: 'N',
        offset: 0,
        link: { room: `r0${String(i + 1)}`, door: 'd1' },
      });
    if (i > 0)
      doors.push({
        id: 'd1',
        wall: 'S',
        offset: 0,
        link: { room: `r0${String(i - 1)}`, door: 'd0' },
      });
    rooms.set(id, { id, doors });
  }
  return rooms;
}

describe('reach (CP08 T4)', () => {
  it('hop distances follow outgoing links within the limit', () => {
    const rooms = line(6);
    expect([...hopDistances(rooms, 'r02', 2)]).toEqual([
      ['r02', 0],
      ['r03', 1],
      ['r01', 1],
      ['r04', 2],
      ['r00', 2],
    ]);
  });

  it('missingWithin lists linked rooms not known yet', () => {
    const rooms = line(6);
    rooms.delete('r04');
    rooms.delete('r05');
    expect(missingWithin(rooms, 'r02', 3)).toEqual(['r04']);
    expect(missingWithin(rooms, 'r00', 2)).toEqual([]);
  });
});

describe('RoomBuilder (CP08 T4)', () => {
  /** A manual idle scheduler: run() fires the queued slot. */
  function manualIdle(timeLeft = 10) {
    let slot: Parameters<IdleScheduler>[0] | null = null;
    const idle: IdleScheduler = (cb) => {
      slot = cb;
      return () => {
        slot = null;
      };
    };
    return {
      idle,
      run(didTimeout = false) {
        const cb = slot;
        slot = null;
        cb?.({ timeRemaining: () => timeLeft, didTimeout });
      },
      get scheduled() {
        return slot !== null;
      },
    };
  }

  function setup(current = 'r00', timeLeft = 10) {
    const rooms = line(6) as unknown as Map<string, RoomDTO>;
    const built: string[] = [];
    const clock = manualIdle(timeLeft);
    const builder = new RoomBuilder({
      isBuilt: (id) => built.includes(id),
      build: (dto) => built.push(dto.id),
      current: () => current,
      known: (id) => (built.includes(id) ? rooms.get(id) : undefined),
      idle: clock.idle,
    });
    return { rooms, built, clock, builder };
  }

  it('builds one room per idle slot, nearest to the player first', () => {
    const { rooms, built, clock, builder } = setup('r00');
    built.push('r00');
    builder.enqueue([...rooms.values()].filter((r) => r.id !== 'r00').reverse());
    expect(builder.size).toBe(5);
    clock.run();
    expect(built).toEqual(['r00', 'r01']);
    clock.run();
    clock.run();
    expect(built).toEqual(['r00', 'r01', 'r02', 'r03']);
    expect(builder.size).toBe(2);
  });

  it('waits for a slot with at least 4 ms left, unless the slot is overdue', () => {
    const { rooms, built, clock, builder } = setup('r00', 2);
    builder.enqueue([rooms.get('r01') as RoomDTO]);
    clock.run();
    expect(built).toEqual([]);
    expect(clock.scheduled).toBe(true);
    clock.run(true);
    expect(built).toEqual(['r01']);
  });

  it('never builds a room twice; drain builds everything; clear drops the queue', () => {
    const { rooms, built, builder } = setup();
    const all = [...rooms.values()];
    builder.enqueue(all);
    builder.enqueue(all);
    builder.drain();
    expect([...built].sort()).toEqual(['r00', 'r01', 'r02', 'r03', 'r04', 'r05']);
    builder.enqueue(all);
    expect(builder.size).toBe(0);
    const other = setup();
    other.builder.enqueue(all);
    other.builder.clear();
    other.clock.run();
    expect(other.built).toEqual([]);
  });
});
