import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Wall } from '../geometry/geometry.js';
import type { Difficulty } from '../seed/seed.js';
import * as fx from './__fixtures__/fixtures.js';
import {
  ApiErrorSchema,
  ClientErrorRequestSchema,
  ColorSchema,
  CompleteRequestSchema,
  CompleteResponseSchema,
  CreateGameRequestSchema,
  CreateGameResponseSchema,
  DebugResponseSchema,
  DebugRoomDTOSchema,
  DesyncErrorSchema,
  DoorDTOSchema,
  DoorIdSchema,
  FurnitureDTOSchema,
  HealthResponseSchema,
  LightDTOSchema,
  PathStepSchema,
  ResultDTOSchema,
  RoomDTOSchema,
  RoomIdSchema,
  RoomsResponseSchema,
  SpawnSchema,
  StartResponseSchema,
  TransitionRequestSchema,
  TransitionResponseSchema,
  type DoorDTO,
  type ResultDTO,
} from './dto.js';

interface Case {
  name: string;
  schema: z.ZodType;
  valid: unknown[];
  invalid: unknown[];
}

const { room, door } = fx;

/** Every DTO schema: at least one valid and two invalid fixtures each (CP01 acceptance). */
const cases: Case[] = [
  {
    name: 'DoorDTO',
    schema: DoorDTOSchema,
    valid: [fx.door, fx.sealedDoor],
    invalid: [
      { ...door, wall: 'X' },
      { ...door, id: 'd10' },
      { ...door, link: undefined },
      { ...door, offset: Number.NaN },
      { ...door, link: { room: 'r3', door: 'd0' } },
    ],
  },
  {
    name: 'FurnitureDTO',
    schema: FurnitureDTOSchema,
    valid: [fx.furniture, { ...fx.furniture, signature: undefined, params: undefined }],
    invalid: [
      { ...fx.furniture, rot: 4 },
      { ...fx.furniture, prefab: 'Sofa' },
      { ...fx.furniture, variant: -1 },
      { ...fx.furniture, variant: 1.5 },
      { ...fx.furniture, colors: ['red'] },
      { ...fx.furniture, signature: false },
      { ...fx.furniture, id: 'f1' },
    ],
  },
  {
    name: 'LightDTO',
    schema: LightDTOSchema,
    valid: [fx.light, { ...fx.light, kind: 'goal', intensity: 0 }],
    invalid: [
      { ...fx.light, intensity: -0.1 },
      { ...fx.light, kind: 'spot' },
      { ...fx.light, y: Number.POSITIVE_INFINITY },
    ],
  },
  {
    name: 'RoomDTO',
    schema: RoomDTOSchema,
    valid: [fx.room, fx.goalRoom, { ...room, doors: [door, door, door, door] }],
    invalid: [
      { ...room, doors: [] },
      { ...room, doors: [door, door, door, door, door] },
      { ...room, lights: [fx.light, fx.light, fx.light, fx.light, fx.light] },
      { ...room, type: 'garage' },
      { ...room, floor: 'stone' },
      { ...room, width: 0 },
      { ...room, palette: { ...room.palette, wall: '#fff' } },
      { ...room, id: 'room7' },
      { ...room, goal: { x: 0, y: 1 } },
    ],
  },
  {
    name: 'Spawn',
    schema: SpawnSchema,
    valid: [fx.spawn],
    invalid: [
      { x: 0, z: 0 },
      { x: 0, z: 0, yaw: '0' },
    ],
  },
  {
    name: 'CreateGameRequest',
    schema: CreateGameRequestSchema,
    valid: [fx.createRandom, fx.createSeed],
    invalid: [
      { mode: 'random', difficulty: 'impossible' },
      { mode: 'seed' },
      { mode: 'daily', difficulty: 'easy' },
      { mode: 'seed', seed: 'x'.repeat(65) },
    ],
  },
  {
    name: 'CreateGameResponse',
    schema: CreateGameResponseSchema,
    valid: [fx.createResponse],
    invalid: [
      { ...fx.createResponse, gameId: 'not-a-uuid' },
      { ...fx.createResponse, seed: 'm1 7k2q x9mp' },
      { ...fx.createResponse, generatorVersion: 0 },
      { ...fx.createResponse, rooms: [{ ...room, doors: [] }] },
    ],
  },
  {
    name: 'StartResponse',
    schema: StartResponseSchema,
    valid: [fx.startResponse],
    invalid: [{ startedAt: '12 Oct 2026' }, { startedAt: 1_791_000_000_000 }, {}],
  },
  {
    name: 'TransitionRequest',
    schema: TransitionRequestSchema,
    valid: [fx.transitionRequest],
    invalid: [
      { ...fx.transitionRequest, seq: 0 },
      { ...fx.transitionRequest, clientElapsedMs: -1 },
      { ...fx.transitionRequest, clientElapsedMs: 1.5 },
      { ...fx.transitionRequest, door: 'door0' },
    ],
  },
  {
    name: 'TransitionResponse',
    schema: TransitionResponseSchema,
    valid: [fx.transitionResponse, { seq: 2, current: 'r01', rooms: [] }],
    invalid: [
      { ...fx.transitionResponse, current: 'R01' },
      { ...fx.transitionResponse, rooms: undefined },
    ],
  },
  {
    name: 'CompleteRequest',
    schema: CompleteRequestSchema,
    valid: [fx.completeRequest, { lastSeq: 0, clientElapsedMs: 0, debugUsed: true }],
    invalid: [
      { ...fx.completeRequest, debugUsed: 'false' },
      { ...fx.completeRequest, lastSeq: -1 },
    ],
  },
  {
    name: 'ResultDTO',
    schema: ResultDTOSchema,
    valid: [fx.result, { ...fx.result, timeSource: 'server', debugUsed: true }],
    invalid: [
      { ...fx.result, timeSource: 'gps' },
      { ...fx.result, completionMs: 1.5 },
      { ...fx.result, completedAt: 'yesterday' },
    ],
  },
  {
    name: 'CompleteResponse',
    schema: CompleteResponseSchema,
    valid: [fx.completeResponse],
    invalid: [{}, { result: { ...fx.result, seed: 'M2-7K2Q' } }],
  },
  {
    name: 'PathStep',
    schema: PathStepSchema,
    valid: [fx.pathStart, fx.pathGoal, { room: 'r01', arriveDoor: 'd1', exitDoor: 'd3' }],
    invalid: [
      { room: 'r01', arriveDoor: 'd1' },
      { room: 'r01', arriveDoor: 'x', exitDoor: null },
    ],
  },
  {
    name: 'DebugRoomDTO',
    schema: DebugRoomDTOSchema,
    valid: [fx.debugRoom, { ...fx.debugRoom, twinOf: 'r02', onSpine: false }],
    invalid: [
      { ...fx.debugRoom, depth: -1 },
      { ...fx.debugRoom, twinOf: undefined },
      { ...fx.debugRoom, doors: [{ id: 'd0', wall: 'Q', link: null }] },
    ],
  },
  {
    name: 'DebugResponse',
    schema: DebugResponseSchema,
    valid: [fx.debugResponse],
    invalid: [
      { ...fx.debugResponse, metrics: { rooms: 'two' } },
      { ...fx.debugResponse, pathFromCurrent: undefined },
      { ...fx.debugResponse, levelHash: '' },
    ],
  },
  {
    name: 'ApiError',
    schema: ApiErrorSchema,
    valid: [fx.apiError],
    invalid: [{ code: 'bad_seed', message: 'x' }, { error: { message: 'x' } }],
  },
  {
    name: 'DesyncError',
    schema: DesyncErrorSchema,
    valid: [{ error: { code: 'desync', message: 'x' }, current: 'r03', lastSeq: 4 }],
    invalid: [
      { error: { code: 'desync', message: 'x' }, current: 'r03' },
      { error: { code: 'desync', message: 'x' }, current: 'kitchen', lastSeq: 4 },
    ],
  },
  {
    name: 'RoomsResponse',
    schema: RoomsResponseSchema,
    valid: [{ rooms: [room] }, { rooms: [] }],
    invalid: [{ rooms: [{ ...room, id: 'x' }] }, {}],
  },
  {
    name: 'ClientErrorRequest',
    schema: ClientErrorRequestSchema,
    valid: [{ message: 'boom' }, { message: 'boom', stack: 'at x', context: { room: 'r01' } }],
    invalid: [{ message: '' }, { stack: 'at x' }, { message: 'x'.repeat(2001) }],
  },
  {
    name: 'HealthResponse',
    schema: HealthResponseSchema,
    valid: [{ status: 'ok', db: 'down', version: '1.0.0' }],
    invalid: [
      { status: 'ok', db: 'maybe', version: '1' },
      { status: 'bad', db: 'ok', version: '1' },
    ],
  },
];

describe.each(cases)('$name schema', ({ schema, valid, invalid }) => {
  it('has at least one valid and two invalid fixtures', () => {
    expect(valid.length).toBeGreaterThanOrEqual(1);
    expect(invalid.length).toBeGreaterThanOrEqual(2);
  });

  it.each(valid.map((v, i) => [i, v] as const))('accepts valid fixture #%i', (_i, value) => {
    const parsed = schema.safeParse(value);
    expect(parsed.error).toBeUndefined();
  });

  it.each(invalid.map((v, i) => [i, v] as const))('rejects invalid fixture #%i', (_i, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('converts to JSON Schema (for Fastify and OpenAPI)', () => {
    expect(() => z.toJSONSchema(schema)).not.toThrow();
  });
});

describe('primitive schemas', () => {
  it('validates IDs and colours', () => {
    expect(RoomIdSchema.safeParse('r00').success).toBe(true);
    expect(RoomIdSchema.safeParse('r100').success).toBe(false);
    expect(DoorIdSchema.safeParse('d9').success).toBe(true);
    expect(DoorIdSchema.safeParse('d').success).toBe(false);
    expect(ColorSchema.safeParse('#A0b1C2').success).toBe(true);
    expect(ColorSchema.safeParse('#a0b1c').success).toBe(false);
  });

  it('strips unknown keys so later checkpoints can extend payloads compatibly', () => {
    const parsed = DoorDTOSchema.parse({ ...door, extra: 1 });
    expect(parsed).toEqual(door);
  });
});

describe('inferred types', () => {
  it('reuse the shared Wall and Difficulty types', () => {
    expectTypeOf<DoorDTO['wall']>().toEqualTypeOf<Wall>();
    expectTypeOf<ResultDTO['difficulty']>().toEqualTypeOf<Difficulty>();
  });
});
