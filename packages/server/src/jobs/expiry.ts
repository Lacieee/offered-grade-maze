/**
 * Hourly housekeeping (CP07 T7).
 *
 * - Games started more than 24 h ago and not completed become `expired`.
 * - Transitions of games that ended more than 30 days ago are deleted (completed: by
 *   `completed_at`; expired: they ended 24 h after `started_at`).
 * - Games still `created` (never started) after 24 h are deleted.
 */
import { and, eq, inArray, lt, or } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import { games, gameTransitions } from '../db/schema.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** What one run changed. */
export interface ExpiryReport {
  expired: number;
  transitionsDeleted: number;
  createdDeleted: number;
}

/** Runs the housekeeping once at time `now`. */
export async function runExpiry(db: Db, now: Date): Promise<ExpiryReport> {
  const t = now.getTime();
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(games)
      .set({ status: 'expired' })
      .where(and(eq(games.status, 'started'), lt(games.startedAt, new Date(t - DAY))))
      .returning({ id: games.id });

    const ended = tx
      .select({ id: games.id })
      .from(games)
      .where(
        or(
          and(eq(games.status, 'completed'), lt(games.completedAt, new Date(t - 30 * DAY))),
          and(eq(games.status, 'expired'), lt(games.startedAt, new Date(t - 31 * DAY))),
        ),
      );
    const transitions = await tx
      .delete(gameTransitions)
      .where(inArray(gameTransitions.gameId, ended))
      .returning({ seq: gameTransitions.seq });

    const created = await tx
      .delete(games)
      .where(and(eq(games.status, 'created'), lt(games.createdAt, new Date(t - DAY))))
      .returning({ id: games.id });

    return {
      expired: expired.length,
      transitionsDeleted: transitions.length,
      createdDeleted: created.length,
    };
  });
}

/**
 * Runs {@link runExpiry} every `intervalMs` (default one hour), never two runs at once.
 * Returns a function that stops it.
 */
export function scheduleExpiry(
  db: Db,
  log: FastifyBaseLogger,
  intervalMs = HOUR,
  now: () => Date = () => new Date(),
): () => void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const report = await runExpiry(db, now());
      log.info({ event: 'job.expiry', ...report }, 'job.expiry');
    } catch (err) {
      log.error({ event: 'job.expiry_failed', err }, 'job.expiry_failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
