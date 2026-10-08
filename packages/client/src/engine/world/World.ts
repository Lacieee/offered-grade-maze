/**
 * The client's world store: built rooms cached by ID. Rooms are immutable for the life of a
 * game, so a room is built once and its scene is reused wherever it appears (current room,
 * behind several portals, through a self-link).
 */
import type { LinkDTO, RoomDTO, RoomId } from '@ogm/shared';
import { buildRoom, type RoomDoor, type RoomView } from '../rooms/buildRoom.js';

export class World {
  private readonly rooms = new Map<RoomId, RoomView>();
  private versionValue = 0;

  /** Increases whenever rooms are added or rebuilt (for caches that depend on the set). */
  get version(): number {
    return this.versionValue;
  }

  /** Builds and caches the rooms not cached yet. Returns the newly built views. */
  load(dtos: readonly RoomDTO[]): RoomView[] {
    const built: RoomView[] = [];
    for (const dto of dtos) {
      if (this.rooms.has(dto.id)) continue;
      const view = buildRoom(dto);
      this.rooms.set(dto.id, view);
      built.push(view);
    }
    if (built.length > 0) this.versionValue++;
    return built;
  }

  /**
   * Rebuilds every room from its cached `RoomDTO` (after a WebGL context loss). The old
   * views are dropped without GPU disposal: their resources died with the old context.
   */
  rebuild(): RoomView[] {
    const dtos = [...this.rooms.values()].map((v) => v.dto);
    this.rooms.clear();
    return this.load(dtos);
  }

  /** The cached room, if loaded. */
  get(id: RoomId): RoomView | undefined {
    return this.rooms.get(id);
  }

  /**
   * The door a link arrives at, if the player may go through: the target room is loaded and
   * the arrival door is not sealed. Sealed doors are decorative (PD9): a link that arrives at
   * one is invalid data, and is treated like a closed doorway rather than letting the player
   * arrive inside a door panel.
   */
  enterableTarget(link: LinkDTO | null): RoomDoor | undefined {
    if (!link) return undefined;
    const door = this.rooms.get(link.room)?.doors.get(link.door);
    return door && door.link !== null ? door : undefined;
  }

  /** True if the room is loaded. */
  has(id: RoomId): boolean {
    return this.rooms.has(id);
  }

  /** IDs of every cached room, sorted. */
  ids(): RoomId[] {
    return [...this.rooms.keys()].sort();
  }

  /** Disposes every room. */
  dispose(): void {
    for (const view of this.rooms.values()) view.dispose();
    this.rooms.clear();
    this.versionValue++;
  }
}
