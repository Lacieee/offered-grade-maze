/**
 * `/api/v1` routes (CP07 T4). Request and response bodies use the `@ogm/shared` schemas;
 * Zod validates both.
 */
import {
  ApiErrorSchema,
  ClientErrorRequestSchema,
  CompleteRequestSchema,
  CompleteResponseSchema,
  CreateGameRequestSchema,
  CreateGameResponseSchema,
  DebugResponseSchema,
  DesyncErrorSchema,
  HealthResponseSchema,
  RoomIdSchema,
  RoomsResponseSchema,
  StartResponseSchema,
  TransitionRequestSchema,
  TransitionResponseSchema,
} from '@ogm/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { MAX_ROOM_IDS, type GameService } from '../games/GameService.js';

export interface ApiRouteOptions {
  games: GameService;
  debugViewEnabled: boolean;
  version: string;
  dbHealthy: () => Promise<boolean>;
}

const GameParams = z.object({ id: z.uuid() });

/** `?ids=r01,r07`: 1–24 room ids. */
const RoomsQuery = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').filter((x) => x.length > 0))
    .pipe(z.array(RoomIdSchema).min(1).max(MAX_ROOM_IDS)),
});

const errors = (...codes: number[]): Record<number, typeof ApiErrorSchema> =>
  Object.fromEntries(codes.map((c) => [c, ApiErrorSchema]));

export const apiRoutes: FastifyPluginAsyncZod<ApiRouteOptions> = (app, opts) => {
  const { games } = opts;
  // Ignored when the rate-limit plugin is not registered (RATE_LIMIT_ENABLED=false).
  const limit = (
    max: number,
    timeWindow: string,
    keyGenerator?: (req: FastifyRequest) => string,
  ): {
    rateLimit: { max: number; timeWindow: string; keyGenerator?: (req: FastifyRequest) => string };
  } => ({
    rateLimit: { max, timeWindow, ...(keyGenerator ? { keyGenerator } : {}) },
  });
  const perGame = (req: FastifyRequest): string =>
    `game:${(req.params as { id?: string }).id ?? req.ip}`;

  app.post(
    '/games',
    {
      config: limit(20, '1 minute'),
      schema: {
        summary: 'Create a game from a random or typed seed',
        body: CreateGameRequestSchema,
        response: { 201: CreateGameResponseSchema, ...errors(400, 422, 429, 503) },
      },
    },
    async (req, reply) => reply.status(201).send(await games.create(req.body)),
  );

  app.post(
    '/games/:id/start',
    {
      schema: {
        summary: 'Start the clock (idempotent)',
        params: GameParams,
        response: { 200: StartResponseSchema, ...errors(404, 409) },
      },
    },
    async (req) => games.start(req.params.id),
  );

  app.post(
    '/games/:id/transitions',
    {
      config: limit(20, '1 second', perGame),
      schema: {
        summary: 'Report one door crossing',
        params: GameParams,
        body: TransitionRequestSchema,
        response: {
          200: TransitionResponseSchema,
          409: z.union([DesyncErrorSchema, ApiErrorSchema]),
          ...errors(400, 404, 429),
        },
      },
    },
    async (req) => games.transition(req.params.id, req.body),
  );

  app.post(
    '/games/:id/complete',
    {
      schema: {
        summary: 'Settle the official time and store the result (idempotent)',
        params: GameParams,
        body: CompleteRequestSchema,
        response: { 200: CompleteResponseSchema, ...errors(400, 404, 409) },
      },
    },
    async (req) => games.complete(req.params.id, req.body),
  );

  app.get(
    '/games/:id/rooms',
    {
      schema: {
        summary: 'Rooms already sent or within reach of the current room',
        params: GameParams,
        querystring: RoomsQuery,
        response: { 200: RoomsResponseSchema, ...errors(400, 403, 404) },
      },
    },
    async (req) => games.rooms(req.params.id, req.query.ids),
  );

  if (opts.debugViewEnabled) {
    app.get(
      '/games/:id/debug',
      {
        schema: {
          summary: 'Debug view: the whole house (marks the game debug_used)',
          params: GameParams,
          response: { 200: DebugResponseSchema, ...errors(404) },
        },
      },
      async (req) => games.debug(req.params.id),
    );
  }

  app.post(
    '/client-errors',
    {
      bodyLimit: 8 * 1024,
      config: limit(10, '1 minute'),
      schema: {
        summary: 'Report a client-side error (logged at warn level)',
        body: ClientErrorRequestSchema,
        response: { 204: z.null(), ...errors(400, 413, 429) },
      },
    },
    async (req, reply) => {
      req.log.warn({ event: 'client.error', report: req.body }, 'client.error');
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness and database status',
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      db: (await opts.dbHealthy()) ? ('ok' as const) : ('down' as const),
      version: opts.version,
    }),
  );

  // Unknown API paths answer in the error format (never the SPA page).
  app.all('/*', { schema: { hide: true } }, () =>
    Promise.reject(new ApiError(404, 'not_found', 'No such API route.')),
  );
  return Promise.resolve();
};
