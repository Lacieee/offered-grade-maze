/**
 * The client's world store: built rooms cached by ID. Rooms are immutable for the life of a
 * game, so a room is built once and its scene is reused wherever it appears.
 */
import type { RoomDTO, RoomId } from '@ogm/shared';
import { buildRoom, type RoomView } from '../rooms/buildRoom.js';

export class World {
  private readonly rooms = new Map<RoomId, RoomView>();

  /** Builds and caches the rooms not cached yet. Returns the newly built views. */
  load(dtos: readonly RoomDTO[]): RoomView[] {
    const built: RoomView[] = [];
    for (const dto of dtos) {
      if (this.rooms.has(dto.id)) continue;
      const view = buildRoom(dto);
      this.rooms.set(dto.id, view);
      built.push(view);
    }
    return built;
  }

  /** The cached room, if loaded. */
  get(id: RoomId): RoomView | undefined {
    return this.rooms.get(id);
  }

  /** IDs of every cached room, sorted. */
  ids(): RoomId[] {
    return [...this.rooms.keys()].sort();
  }

  /** Disposes every room. */
  dispose(): void {
    for (const view of this.rooms.values()) view.dispose();
    this.rooms.clear();
  }
}
