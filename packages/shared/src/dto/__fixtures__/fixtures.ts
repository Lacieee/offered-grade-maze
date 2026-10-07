/** Valid example payloads for every DTO, used by tests (and later by the mock API). */
import type {
  ApiError,
  CompleteRequest,
  CompleteResponse,
  CreateGameRequest,
  CreateGameResponse,
  DebugResponse,
  DebugRoomDTO,
  DoorDTO,
  FurnitureDTO,
  LightDTO,
  PathStep,
  ResultDTO,
  RoomDTO,
  Spawn,
  StartResponse,
  TransitionRequest,
  TransitionResponse,
} from '../dto.js';

export const door: DoorDTO = {
  id: 'd0',
  wall: 'N',
  offset: 0.75,
  link: { room: 'r03', door: 'd2' },
};

export const sealedDoor: DoorDTO = { id: 'd1', wall: 'E', offset: -1, link: null };

export const furniture: FurnitureDTO = {
  id: 'f00',
  prefab: 'painting',
  x: 1.25,
  z: -2.5,
  rot: 2,
  variant: 1,
  colors: ['#aa3322', '#F0E0D0'],
  signature: true,
  params: { pattern: 'stripes', stripes: 5 },
};

export const light: LightDTO = {
  kind: 'ceiling',
  x: 0,
  y: 2.7,
  z: 0,
  color: '#fff4e0',
  intensity: 1.2,
};

export const room: RoomDTO = {
  id: 'r07',
  type: 'kitchen',
  label: 'room.kitchen',
  width: 5,
  depth: 4.5,
  height: 2.8,
  floor: 'tile',
  palette: { wall: '#e8e2d0', floor: '#9a9a9a', trim: '#ffffff', ceiling: '#f5f5f5' },
  doors: [door, sealedDoor],
  furniture: [furniture],
  lights: [light],
};

export const goalRoom: RoomDTO = {
  ...room,
  id: 'r09',
  type: 'bathroom',
  label: 'room.bathroom',
  goal: { x: 0, y: 1.2, z: 0 },
};

export const spawn: Spawn = { x: 0, z: 1.5, yaw: Math.PI };

export const createRandom: CreateGameRequest = { mode: 'random', difficulty: 'medium' };

export const createSeed: CreateGameRequest = { mode: 'seed', seed: 'm1 7k2q x9mp' };

export const createResponse: CreateGameResponse = {
  gameId: '3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b',
  seed: 'M1-7K2Q-X9MP',
  difficulty: 'medium',
  generatorVersion: 1,
  startRoom: 'r07',
  spawn,
  rooms: [room, goalRoom],
};

export const startResponse: StartResponse = { startedAt: '2026-10-12T08:30:00.000Z' };

export const transitionRequest: TransitionRequest = {
  seq: 1,
  from: 'r07',
  door: 'd0',
  clientElapsedMs: 4210,
};

export const transitionResponse: TransitionResponse = { seq: 1, current: 'r03', rooms: [goalRoom] };

export const completeRequest: CompleteRequest = {
  lastSeq: 7,
  clientElapsedMs: 83_450,
  debugUsed: false,
};

export const result: ResultDTO = {
  seed: 'M1-7K2Q-X9MP',
  difficulty: 'medium',
  completionMs: 83_450,
  timeSource: 'client',
  completedAt: '2026-10-12T08:31:23.450Z',
  debugUsed: false,
};

export const completeResponse: CompleteResponse = { result };

export const pathStart: PathStep = { room: 'r07', arriveDoor: null, exitDoor: 'd0' };
export const pathGoal: PathStep = { room: 'r09', arriveDoor: 'd2', exitDoor: null };

export const debugRoom: DebugRoomDTO = {
  id: 'r07',
  type: 'kitchen',
  label: 'room.kitchen',
  depth: 0,
  onSpine: true,
  twinOf: null,
  doors: [
    { id: 'd0', wall: 'N', link: { room: 'r09', door: 'd2' } },
    { id: 'd1', wall: 'E', link: null },
  ],
};

export const debugResponse: DebugResponse = {
  seed: 'M1-7K2Q-X9MP',
  difficulty: 'medium',
  generatorVersion: 1,
  levelHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  start: 'r07',
  goal: 'r09',
  current: 'r07',
  rooms: [
    debugRoom,
    { ...debugRoom, id: 'r09', depth: 1, type: 'bathroom', label: 'room.bathroom' },
  ],
  metrics: { rooms: 2, solutionLength: 1, asymmetricShare: 0.5 },
  pathFromStart: [pathStart, pathGoal],
  pathFromCurrent: [pathStart, pathGoal],
};

export const apiError: ApiError = {
  error: { code: 'bad_seed', message: 'Seed code is malformed.' },
};
