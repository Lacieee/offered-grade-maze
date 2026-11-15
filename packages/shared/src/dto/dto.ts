/**
 * Wire contracts between client and server (`/api/v1`), as Zod schemas.
 *
 * Later checkpoints may extend these schemas but must not break them. Never change a
 * DTO without updating both client and server in the same pull request.
 */
import { z } from 'zod';
import { WALLS } from '../geometry/geometry.js';
import { PREFAB_IDS } from '../prefabs/catalog.js';
import { CANONICAL_SEED_PATTERN, DIFFICULTIES } from '../seed/seed.js';

// ---------------------------------------------------------------- primitives

/** Room ID, `r00`…`r99`. */
export const RoomIdSchema = z.string().regex(/^r\d{2}$/);
/** Door ID, unique within its room, `d0`…`d9`. */
export const DoorIdSchema = z.string().regex(/^d\d$/);
/** Furniture ID, unique within its room, `f00`…`f99`. */
export const FurnitureIdSchema = z.string().regex(/^f\d{2}$/);
/** Prefab ID from the prefab catalogue (CP05), e.g. `sofa_3seat` or `floor_lamp`. */
export const PrefabIdSchema = z.enum(PREFAB_IDS);
/** CSS hex colour, `#rrggbb`. */
export const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
/** Finite number (Zod rejects NaN and ±Infinity). */
export const NumSchema = z.number();
/** Non-negative integer. */
export const UIntSchema = z.int().min(0);
/** Canonical seed code, e.g. `M1-7K2Q-X9MP`. Typed input is parsed with `parseSeed` instead. */
export const CanonicalSeedSchema = z.string().regex(CANONICAL_SEED_PATTERN);
/** ISO 8601 UTC timestamp, e.g. `2026-10-12T08:30:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime();

export const WallSchema = z.enum(WALLS);
export const DifficultySchema = z.enum(DIFFICULTIES);
export const RoomTypeSchema = z.enum([
  'living',
  'kitchen',
  'bedroom',
  'bathroom',
  'hallway',
  'study',
]);
export const FloorKindSchema = z.enum(['wood', 'tile', 'carpet']);

export const Vec3Schema = z.object({ x: NumSchema, y: NumSchema, z: NumSchema });

// ---------------------------------------------------------------- rooms

/** Target of a door's outgoing link. */
export const LinkSchema = z.object({ room: RoomIdSchema, door: DoorIdSchema });

/** A doorway in a room wall. `link = null` means a sealed door. */
export const DoorDTOSchema = z.object({
  id: DoorIdSchema,
  wall: WallSchema,
  offset: NumSchema,
  link: LinkSchema.nullable(),
});

/** A placed furniture item. `rot` is a quarter-turn count about +Y. */
export const FurnitureDTOSchema = z.object({
  id: FurnitureIdSchema,
  prefab: PrefabIdSchema,
  x: NumSchema,
  z: NumSchema,
  rot: z.literal([0, 1, 2, 3]),
  variant: UIntSchema,
  colors: z.array(ColorSchema),
  signature: z.literal(true).optional(),
  params: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
});

export const LightDTOSchema = z.object({
  kind: z.enum(['ceiling', 'lamp', 'goal']),
  x: NumSchema,
  y: NumSchema,
  z: NumSchema,
  color: ColorSchema,
  intensity: NumSchema.min(0),
});

export const PaletteSchema = z.object({
  wall: ColorSchema,
  floor: ColorSchema,
  trim: ColorSchema,
  ceiling: ColorSchema,
});

/**
 * A fully described room. Rooms are immutable for the life of a game, so the client
 * caches them by ID. Depth, spine membership and twin links are deliberately absent
 * (they appear only in {@link DebugResponseSchema}).
 */
export const RoomDTOSchema = z.object({
  id: RoomIdSchema,
  type: RoomTypeSchema,
  /** i18n key, e.g. `room.living`. */
  label: z.string().min(1),
  width: NumSchema.positive(),
  depth: NumSchema.positive(),
  height: NumSchema.positive(),
  floor: FloorKindSchema,
  palette: PaletteSchema,
  doors: z.array(DoorDTOSchema).min(1).max(4),
  furniture: z.array(FurnitureDTOSchema),
  lights: z.array(LightDTOSchema).max(4),
  /** Position of the goal object; only present in the goal room. */
  goal: Vec3Schema.optional(),
});

/** Player spawn point in the start room. */
export const SpawnSchema = z.object({ x: NumSchema, z: NumSchema, yaw: NumSchema });

// ---------------------------------------------------------------- game API

export const CreateGameRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('random'), difficulty: DifficultySchema }),
  z.object({ mode: z.literal('seed'), seed: z.string().max(64) }),
]);

export const CreateGameResponseSchema = z.object({
  gameId: z.uuid(),
  seed: CanonicalSeedSchema,
  difficulty: DifficultySchema,
  generatorVersion: z.int().min(1),
  startRoom: RoomIdSchema,
  spawn: SpawnSchema,
  rooms: z.array(RoomDTOSchema),
});

export const StartResponseSchema = z.object({ startedAt: IsoDateTimeSchema });

export const TransitionRequestSchema = z.object({
  seq: z.int().min(1),
  from: RoomIdSchema,
  door: DoorIdSchema,
  clientElapsedMs: UIntSchema,
});

export const TransitionResponseSchema = z.object({
  seq: z.int().min(1),
  current: RoomIdSchema,
  rooms: z.array(RoomDTOSchema),
});

export const CompleteRequestSchema = z.object({
  lastSeq: UIntSchema,
  clientElapsedMs: UIntSchema,
  debugUsed: z.boolean(),
});

export const ResultDTOSchema = z.object({
  seed: CanonicalSeedSchema,
  difficulty: DifficultySchema,
  completionMs: UIntSchema,
  timeSource: z.enum(['client', 'server']),
  completedAt: IsoDateTimeSchema,
  debugUsed: z.boolean(),
});

export const CompleteResponseSchema = z.object({ result: ResultDTOSchema });

/** `GET /games/:id/rooms?ids=…` (CP07 T4): at most 24 ids. */
export const RoomsResponseSchema = z.object({ rooms: z.array(RoomDTOSchema) });

/** `POST /client-errors` (CP07 T4): a client-side error report, at most 8 kB in total. */
export const ClientErrorRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(6000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/** `GET /health` (CP07 T4). */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['ok', 'down']),
  version: z.string().min(1),
});

// ---------------------------------------------------------------- debug view

/**
 * One step of a door-level path. The first step has `arriveDoor = null`; the last step
 * (the goal room) has `exitDoor = null`.
 */
export const PathStepSchema = z.object({
  room: RoomIdSchema,
  arriveDoor: DoorIdSchema.nullable(),
  exitDoor: DoorIdSchema.nullable(),
});

export const DebugRoomDTOSchema = z.object({
  id: RoomIdSchema,
  type: RoomTypeSchema,
  label: z.string().min(1),
  depth: UIntSchema,
  onSpine: z.boolean(),
  twinOf: RoomIdSchema.nullable(),
  doors: z.array(z.object({ id: DoorIdSchema, wall: WallSchema, link: LinkSchema.nullable() })),
});

export const DebugResponseSchema = z.object({
  seed: CanonicalSeedSchema,
  difficulty: DifficultySchema,
  generatorVersion: z.int().min(1),
  levelHash: z.string().min(1),
  start: RoomIdSchema,
  goal: RoomIdSchema,
  current: RoomIdSchema,
  rooms: z.array(DebugRoomDTOSchema),
  metrics: z.record(z.string(), NumSchema),
  pathFromStart: z.array(PathStepSchema),
  pathFromCurrent: z.array(PathStepSchema),
});

// ---------------------------------------------------------------- errors

/** Body of every non-2xx API response. */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string() }),
});

/**
 * 409 `desync` from `POST /games/:id/transitions` (CP07 T5): the server's view of the game,
 * so the client can resynchronise. The game stays playable.
 */
export const DesyncErrorSchema = ApiErrorSchema.extend({
  current: RoomIdSchema,
  lastSeq: UIntSchema,
});

// ---------------------------------------------------------------- types

export type RoomId = z.infer<typeof RoomIdSchema>;
export type DoorId = z.infer<typeof DoorIdSchema>;
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type FloorKind = z.infer<typeof FloorKindSchema>;
export type LinkDTO = z.infer<typeof LinkSchema>;
export type DoorDTO = z.infer<typeof DoorDTOSchema>;
export type FurnitureDTO = z.infer<typeof FurnitureDTOSchema>;
export type LightDTO = z.infer<typeof LightDTOSchema>;
export type PaletteDTO = z.infer<typeof PaletteSchema>;
export type RoomDTO = z.infer<typeof RoomDTOSchema>;
export type Spawn = z.infer<typeof SpawnSchema>;
export type CreateGameRequest = z.infer<typeof CreateGameRequestSchema>;
export type CreateGameResponse = z.infer<typeof CreateGameResponseSchema>;
export type StartResponse = z.infer<typeof StartResponseSchema>;
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;
export type TransitionResponse = z.infer<typeof TransitionResponseSchema>;
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type ResultDTO = z.infer<typeof ResultDTOSchema>;
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;
export type PathStep = z.infer<typeof PathStepSchema>;
export type DebugRoomDTO = z.infer<typeof DebugRoomDTOSchema>;
export type DebugResponse = z.infer<typeof DebugResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type DesyncError = z.infer<typeof DesyncErrorSchema>;
export type RoomsResponse = z.infer<typeof RoomsResponseSchema>;
export type ClientErrorRequest = z.infer<typeof ClientErrorRequestSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
