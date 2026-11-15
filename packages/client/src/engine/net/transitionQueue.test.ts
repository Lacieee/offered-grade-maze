import type { TransitionRequest, TransitionResponse } from '@ogm/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, type GameApi } from './api.js';
import { RECONNECTING_AFTER_MS, TransitionQueue, backoffMs } from './transitionQueue.js';

/** A fake API whose transition() answers come from a script. */
function fakeApi(answer: (t: TransitionRequest, call: number) => Promise<TransitionResponse>) {
  const sent: TransitionRequest[] = [];
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const api = {
    transition: async (_id: string, t: TransitionRequest) => {
      sent.push({ ...t });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await answer(t, ++calls);
      } finally {
        inFlight--;
      }
    },
    reportError: vi.fn(),
  } as unknown as GameApi;
  return { api, sent, maxInFlight: () => maxInFlight };
}

const ok = (
  t: TransitionRequest,
  rooms: TransitionResponse['rooms'] = [],
): Promise<TransitionResponse> => Promise.resolve({ seq: t.seq, current: 'r09', rooms });

describe('TransitionQueue (CP08 T2)', () => {
  it('backoff: 0.5 s, 1 s, 2 s … at most 8 s', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(backoffMs)).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('sends in order, one at a time, with seq from 1; flush resolves when empty', async () => {
    const { api, sent, maxInFlight } = fakeApi(
      (t) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ seq: t.seq, current: 'r01', rooms: [] });
          }, 5);
        }),
    );
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      onRooms: vi.fn(),
      onDesync: vi.fn(),
      onReconnecting: vi.fn(),
    });
    q.enqueue('r00', 'd0', 1000.4);
    q.enqueue('r01', 'd1', 2000);
    q.enqueue('r02', 'd0', 3000);
    expect(q.pending).toBe(3);
    await q.flush();
    expect(sent.map((t) => [t.seq, t.from, t.door, t.clientElapsedMs])).toEqual([
      [1, 'r00', 'd0', 1000],
      [2, 'r01', 'd1', 2000],
      [3, 'r02', 'd0', 3000],
    ]);
    expect(maxInFlight()).toBe(1);
    expect(q.lastSeq).toBe(3);
    await expect(q.flush()).resolves.toBeUndefined();
  });

  it('passes returned rooms on', async () => {
    const room = { id: 'r05' } as TransitionResponse['rooms'][number];
    const { api } = fakeApi((t) => ok(t, [room]));
    const onRooms = vi.fn();
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      onRooms,
      onDesync: vi.fn(),
      onReconnecting: vi.fn(),
    });
    q.enqueue('r00', 'd0', 1);
    await q.flush();
    expect(onRooms).toHaveBeenCalledWith([room]);
  });

  it('retries network errors with backoff and shows "Reconnecting…" after 3 s', async () => {
    vi.useFakeTimers();
    let up = false;
    const { api, sent } = fakeApi((t) => (up ? ok(t) : Promise.reject(new NetworkError('down'))));
    const badge: boolean[] = [];
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      onRooms: vi.fn(),
      onDesync: vi.fn(),
      onReconnecting: (on) => badge.push(on),
    });
    q.enqueue('r00', 'd0', 1);
    const flushed = q.flush();
    await vi.advanceTimersByTimeAsync(RECONNECTING_AFTER_MS - 100);
    expect(badge).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(badge).toEqual([true]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent.length).toBeGreaterThan(4);
    up = true;
    await vi.advanceTimersByTimeAsync(9000);
    await flushed;
    expect(badge).toEqual([true, false]);
    expect(q.lastSeq).toBe(1);
    // Every attempt carried the same seq: nothing was skipped or duplicated.
    expect(new Set(sent.map((t) => t.seq))).toEqual(new Set([1]));
    vi.useRealTimers();
  });

  it('a short outage (< 3 s) never shows the badge', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { api } = fakeApi((t) => (++calls <= 2 ? Promise.reject(new NetworkError('x')) : ok(t)));
    const badge: boolean[] = [];
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      onRooms: vi.fn(),
      onDesync: vi.fn(),
      onReconnecting: (on) => badge.push(on),
    });
    q.enqueue('r00', 'd0', 1);
    await vi.advanceTimersByTimeAsync(5000);
    await q.flush();
    expect(badge).toEqual([]);
    vi.useRealTimers();
  });

  it('on desync: reports, drops the event, renumbers the rest from the server last_seq', async () => {
    const { api, sent } = fakeApi((t, call) =>
      call === 2
        ? Promise.reject(
            new ApiError(409, 'desync', 'x', {
              error: { code: 'desync', message: 'x' },
              current: 'r01',
              lastSeq: 1,
            }),
          )
        : ok(t),
    );
    const onDesync = vi.fn();
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      onRooms: vi.fn(),
      onDesync,
      onReconnecting: vi.fn(),
    });
    q.enqueue('r00', 'd0', 1);
    q.enqueue('r01', 'd9', 2); // rejected
    q.enqueue('r01', 'd1', 3);
    await q.flush();
    expect(onDesync).toHaveBeenCalledOnce();
    expect(onDesync.mock.calls[0]?.[1]).toEqual({ current: 'r01', lastSeq: 1 });
    expect(sent.map((t) => `${String(t.seq)}:${t.from}.${t.door}`)).toEqual([
      '1:r00.d0',
      '2:r01.d9',
      '2:r01.d1',
    ]);
    expect(q.lastSeq).toBe(2);
    q.enqueue('r02', 'd0', 4);
    await q.flush();
    expect(sent.at(-1)?.seq).toBe(3);
  });

  it('sends nothing before the game started', async () => {
    let start: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      start = resolve;
    });
    const { api, sent } = fakeApi((t) => ok(t));
    const q = new TransitionQueue({
      api,
      gameId: 'g',
      ready,
      onRooms: vi.fn(),
      onDesync: vi.fn(),
      onReconnecting: vi.fn(),
    });
    q.enqueue('r00', 'd0', 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(0);
    start();
    await q.flush();
    expect(sent).toHaveLength(1);
  });
});
