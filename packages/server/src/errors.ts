/**
 * API errors (CP07 T1): every non-2xx response is `{ error: { code, message } }` with an
 * English message, never a stack trace.
 */
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** An error with an HTTP status and a machine-readable code. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Extra top-level fields of the error body (for example `current` on `desync`). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** 404 for an unknown game id. */
export const gameNotFound = (): ApiError => new ApiError(404, 'game_not_found', 'No such game.');

/** Installs the error and not-found handlers that produce the error format. */
export function installErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ApiError, request, reply) => {
    if (err instanceof ApiError) {
      return reply
        .status(err.status)
        .send({ error: { code: err.code, message: err.message }, ...err.extra });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const where = err.validationContext ?? 'request';
      const first = err.validation[0];
      const detail = first ? `${first.instancePath || '/'} ${first.message ?? ''}`.trim() : '';
      return reply.status(400).send({
        error: { code: 'invalid_request', message: `Invalid ${where}: ${detail}` },
      });
    }
    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply
        .status(429)
        .send({ error: { code: 'rate_limited', message: 'Too many requests. Try again soon.' } });
    }
    if (status === 413) {
      return reply
        .status(413)
        .send({ error: { code: 'payload_too_large', message: 'Request body too large.' } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({
        error: { code: 'bad_request', message: err.message || 'Bad request.' },
      });
    }
    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'internal', message: 'Internal server error.' } });
  });
}
