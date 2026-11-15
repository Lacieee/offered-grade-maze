/**
 * Database schema (CP07 T2). No personal data: no IP addresses, no user agents.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Game statuses. */
export type GameStatus = 'created' | 'started' | 'completed' | 'expired';
/** Game integrity: `desync` once any transition failed validation. */
export type Integrity = 'ok' | 'desync';

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const games = pgTable('games', {
  id: uuid('id').primaryKey(),
  seedCode: text('seed_code').notNull(),
  difficulty: text('difficulty').notNull(),
  generatorVersion: integer('generator_version').notNull(),
  levelHash: text('level_hash').notNull(),
  status: text('status').$type<GameStatus>().notNull(),
  currentRoom: text('current_room').notNull(),
  lastSeq: integer('last_seq').notNull().default(0),
  sentRooms: text('sent_rooms').array().notNull(),
  debugUsed: boolean('debug_used').notNull().default(false),
  integrity: text('integrity').$type<Integrity>().notNull().default('ok'),
  createdAt: tz('created_at').notNull().defaultNow(),
  startedAt: tz('started_at'),
  completedAt: tz('completed_at'),
});

export const results = pgTable(
  'results',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .unique()
      .references(() => games.id),
    seedCode: text('seed_code').notNull(),
    difficulty: text('difficulty').notNull(),
    generatorVersion: integer('generator_version').notNull(),
    completionMs: integer('completion_ms').notNull(),
    timeSource: text('time_source').$type<'client' | 'server'>().notNull(),
    transitions: integer('transitions').notNull(),
    debugUsed: boolean('debug_used').notNull(),
    integrity: text('integrity').$type<Integrity>().notNull(),
    completedAt: tz('completed_at').notNull(),
  },
  (t) => [
    index('results_seed_code_idx').on(t.seedCode),
    index('results_difficulty_completion_idx').on(t.difficulty, t.completionMs),
  ],
);

export const gameTransitions = pgTable(
  'game_transitions',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    seq: integer('seq').notNull(),
    fromRoom: text('from_room').notNull(),
    door: text('door').notNull(),
    toRoom: text('to_room').notNull(),
    clientElapsedMs: integer('client_elapsed_ms').notNull(),
    serverAt: tz('server_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.seq] })],
);

export type GameRow = typeof games.$inferSelect;
export type ResultRow = typeof results.$inferSelect;
