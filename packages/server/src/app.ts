/**
 * The Fastify application (CP07 T1): plugins, error format, `/api/v1` routes and the static
 * client. `buildApp` does not listen, so tests drive it with `inject`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { pingDatabase, type Db } from './db/client.js';
import { ApiError, installErrorHandlers } from './errors.js';
import { GameService } from './games/GameService.js';
import { LevelCache } from './levels/LevelCache.js';
import { apiRoutes } from './routes/api.js';

/** API prefix. */
export const API_PREFIX = '/api/v1';

/** Server package version (from package.json, next to `src`/`dist`). */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

/** Default location of the built client. */
export const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

export interface AppDeps {
  config: Config;
  db: Db;
  /** Defaults to a cache of `LEVEL_CACHE_SIZE` levels. */
  cache?: LevelCache;
  now?: () => Date;
  random?: () => Uint8Array;
  /** Pino logger options override (tests pass `false`). */
  logger?: boolean;
}

export interface App {
  app: FastifyInstance;
  games: GameService;
  cache: LevelCache;
}

/** Request body limit for every route (bytes, CP10 B4). */
export const BODY_LIMIT = 16 * 1024;

/** Builds the app (call `app.ready()` or `app.listen()` next). */
export async function buildApp(deps: AppDeps): Promise<App> {
  const { config } = deps;
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            // No IP addresses or user agents in the logs either.
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                method: req.method,
                url: req.url,
                id: req.id,
              }),
            },
          },
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' && /^[\w-]{1,64}$/.test(header) ? header : randomUUID();
    },
    trustProxy: false,
    // The largest real body is a few hundred bytes; client error reports allow 8 kB.
    bodyLimit: BODY_LIMIT,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandlers(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React sets inline styles; Three.js may use blob workers and data/blob images.
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    // Plain HTTP on localhost (PD4): no HSTS.
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
  });
  // Per-route limits (see routes); RATE_LIMIT_ENABLED=false skips the plugin entirely.
  if (config.RATE_LIMIT_ENABLED) await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Offered Grade Maze API',
        version: VERSION,
        description: 'Game sessions, room streaming, door transitions and results (CP07).',
      },
    },
    transform: jsonSchemaTransform,
  });

  const cache = deps.cache ?? new LevelCache(config.LEVEL_CACHE_SIZE);
  const games = new GameService({
    db: deps.db,
    cache,
    log: app.log,
    radius: config.PREFETCH_RADIUS,
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.random ? { random: deps.random } : {}),
  });

  await app.register(apiRoutes, {
    prefix: API_PREFIX,
    games,
    debugViewEnabled: config.DEBUG_VIEW_ENABLED,
    version: VERSION,
    dbHealthy: () => pingDatabase(deps.db),
  });

  registerClient(app, config.CLIENT_DIST || DEFAULT_CLIENT_DIST);
  return { app, games, cache };
}

/**
 * Serves the built client: hashed assets cached for a year, `index.html` never cached, and
 * every other non-API GET falls back to `index.html` (single-page app).
 */
function registerClient(app: FastifyInstance, root: string): void {
  const hasClient = existsSync(`${root}/index.html`);
  if (hasClient) {
    void app.register(fastifyStatic, {
      root,
      wildcard: false,
      index: false,
      cacheControl: false,
      setHeaders: (reply, path) => {
        reply.header(
          'cache-control',
          path.endsWith('.html')
            ? 'no-cache'
            : /[/\\]assets[/\\]/.test(path)
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600',
        );
      },
    });
  }
  app.setNotFoundHandler(async (req, reply) => {
    const page = req.method === 'GET' || req.method === 'HEAD';
    if (page && !req.url.startsWith(`${API_PREFIX}/`) && hasClient) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    throw new ApiError(404, 'not_found', 'Not found.');
  });
}
