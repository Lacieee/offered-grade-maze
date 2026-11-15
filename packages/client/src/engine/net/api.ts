/**
 * Typed client for the game API (CP08 T1). Relative URLs (`/api/v1/...`); every response is
 * parsed with its `@ogm/shared` schema. A response that does not match is reported to
 * `POST /client-errors` and treated as an error.
 */
import {
  ApiErrorSchema,
  CompleteResponseSchema,
  CreateGameResponseSchema,
  DebugResponseSchema,
  DesyncErrorSchema,
  RoomsResponseSchema,
  StartResponseSchema,
  TransitionResponseSchema,
  type CompleteRequest,
  type CompleteResponse,
  type CreateGameRequest,
  type CreateGameResponse,
  type DebugResponse,
  type RoomDTO,
  type RoomId,
  type StartResponse,
  type TransitionRequest,
  type TransitionResponse,
} from '@ogm/shared';

/** API base path. */
export const API_BASE = '/api/v1';
/** Timeout of `POST /games` (ms). */
export const CREATE_TIMEOUT_MS = 8000;
/** Timeout of every other request (ms). */
export const REQUEST_TIMEOUT_MS = 5000;

/** The server answered with an error (`{ error: { code, message } }`). */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The whole error body (409 `desync` carries `current` and `lastSeq`). */
    readonly body: unknown = null,
  ) {
    super(message);
  }

  /** Worth retrying: server trouble or a rate limit, not a rule violation. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

/** The request did not reach the server or timed out. Always worth retrying. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';
}

/** Everything the game needs from the server; implemented by {@link HttpApi} and the mock. */
export interface GameApi {
  createGame(request: CreateGameRequest): Promise<CreateGameResponse>;
  startGame(gameId: string): Promise<StartResponse>;
  transition(gameId: string, t: TransitionRequest): Promise<TransitionResponse>;
  complete(gameId: string, c: CompleteRequest): Promise<CompleteResponse>;
  rooms(gameId: string, ids: readonly RoomId[]): Promise<RoomDTO[]>;
  debug(gameId: string): Promise<DebugResponse>;
  /** Fire and forget: never throws. */
  reportError(message: string, context?: Record<string, unknown>): void;
}

/** True for errors worth retrying (network trouble, 5xx, 429). */
export function isRetryable(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof ApiError && err.retryable);
}

interface Schema<T> {
  safeParse(
    v: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string } };
}

export class HttpApi implements GameApi {
  constructor(
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly base = API_BASE,
  ) {}

  createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
    return this.call('POST', '/games', CreateGameResponseSchema, request, CREATE_TIMEOUT_MS);
  }

  startGame(gameId: string): Promise<StartResponse> {
    return this.call('POST', `/games/${gameId}/start`, StartResponseSchema);
  }

  transition(gameId: string, t: TransitionRequest): Promise<TransitionResponse> {
    return this.call('POST', `/games/${gameId}/transitions`, TransitionResponseSchema, t);
  }

  complete(gameId: string, c: CompleteRequest): Promise<CompleteResponse> {
    return this.call('POST', `/games/${gameId}/complete`, CompleteResponseSchema, c);
  }

  async rooms(gameId: string, ids: readonly RoomId[]): Promise<RoomDTO[]> {
    const query = encodeURIComponent(ids.join(','));
    const r = await this.call('GET', `/games/${gameId}/rooms?ids=${query}`, RoomsResponseSchema);
    return r.rooms;
  }

  debug(gameId: string): Promise<DebugResponse> {
    return this.call('GET', `/games/${gameId}/debug`, DebugResponseSchema);
  }

  reportError(message: string, context?: Record<string, unknown>): void {
    const full = JSON.stringify({
      message: message.slice(0, 2000),
      ...(context ? { context } : {}),
    });
    const body = full.length > 8000 ? JSON.stringify({ message: message.slice(0, 2000) }) : full;
    try {
      void Promise.resolve(
        this.fetchFn(`${this.base}/client-errors`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }),
      ).catch(() => undefined);
    } catch {
      // Reporting must never break the caller.
    }
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: Schema<T>,
    body?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch (err) {
      throw new NetworkError(
        controller.signal.aborted
          ? `${method} ${path} timed out`
          : `${method} ${path}: ${String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      if (parsed.success) {
        throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, json);
      }
      throw new ApiError(
        res.status,
        'http_error',
        `${method} ${path}: HTTP ${String(res.status)}`,
        json,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      this.reportError(`Response of ${method} ${path} does not match its schema`, {
        status: res.status,
        issues: parsed.error.message.slice(0, 1500),
      });
      throw new ApiError(res.status, 'invalid_response', `Unexpected response from ${path}.`, json);
    }
    return parsed.data;
  }
}

/** The `current` and `lastSeq` of a 409 `desync`, if `err` is one. */
export function desyncInfo(err: unknown): { current: RoomId; lastSeq: number } | null {
  if (!(err instanceof ApiError) || err.code !== 'desync') return null;
  const parsed = DesyncErrorSchema.safeParse(err.body);
  return parsed.success ? { current: parsed.data.current, lastSeq: parsed.data.lastSeq } : null;
}
