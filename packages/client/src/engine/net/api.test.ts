import { describe, expect, it, vi } from 'vitest';
import { ApiError, HttpApi, NetworkError, desyncInfo, isRetryable } from './api.js';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const START = { startedAt: '2026-11-01T10:00:00.000Z' };

const urlOf = (u: string | URL | Request): string =>
  typeof u === 'string' ? u : u instanceof URL ? u.href : u.url;

describe('HttpApi (CP08 T1)', () => {
  it('calls relative /api/v1 URLs and parses responses with the shared schemas', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(json(200, START)));
    const api = new HttpApi(fetchFn);
    await expect(api.startGame('g1')).resolves.toEqual(START);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/games/g1/start');
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('turns error bodies into ApiError with the server code', async () => {
    const api = new HttpApi(() =>
      Promise.resolve(
        json(409, { error: { code: 'desync', message: 'x' }, current: 'r03', lastSeq: 4 }),
      ),
    );
    const err = await api
      .transition('g1', { seq: 5, from: 'r01', door: 'd0', clientElapsedMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('desync');
    expect(desyncInfo(err)).toEqual({ current: 'r03', lastSeq: 4 });
    expect(isRetryable(err)).toBe(false);
  });

  it('reports a response that does not match its schema and fails with invalid_response', async () => {
    const calls: string[] = [];
    const api = new HttpApi((url) => {
      calls.push(urlOf(url));
      return Promise.resolve(
        urlOf(url).endsWith('client-errors') ? json(204, null) : json(200, { startedAt: 7 }),
      );
    });
    const err = await api.startGame('g1').catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('invalid_response');
    expect(calls).toContain('/api/v1/client-errors');
  });

  it('network failures and timeouts are NetworkErrors (retryable)', async () => {
    const down = new HttpApi(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = await down.startGame('g1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(isRetryable(err)).toBe(true);

    vi.useFakeTimers();
    const hang = new HttpApi(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const pending = hang.startGame('g1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    const timedOut = await pending;
    expect(timedOut).toBeInstanceOf(NetworkError);
    expect((timedOut as Error).message).toMatch(/timed out/);
    vi.useRealTimers();
  });

  it('server errors and rate limits are retryable; rule violations are not', () => {
    expect(isRetryable(new ApiError(503, 'x', 'x'))).toBe(true);
    expect(isRetryable(new ApiError(429, 'rate_limited', 'x'))).toBe(true);
    expect(isRetryable(new ApiError(409, 'not_at_goal', 'x'))).toBe(false);
    expect(isRetryable(new Error('x'))).toBe(false);
  });

  it('rooms() sends the ids and returns the rooms', async () => {
    let url = '';
    const api = new HttpApi((u) => {
      url = urlOf(u);
      return Promise.resolve(json(200, { rooms: [] }));
    });
    await expect(api.rooms('g1', ['r01', 'r07'])).resolves.toEqual([]);
    expect(url).toBe('/api/v1/games/g1/rooms?ids=r01%2Cr07');
  });
});
