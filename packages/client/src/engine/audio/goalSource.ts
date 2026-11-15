/**
 * Where the goal hum comes from (CP09 T5): the diploma itself in the goal room; seen through
 * portals, its image behind the shallowest doorway that shows the goal room.
 */
import type { RoomId } from '@ogm/shared';
import type * as THREE from 'three';
import type { PortalTreeEntry } from '../portals/PortalRenderer.js';

/** Attenuation per portal level (dB). */
export const HUM_DB_PER_LEVEL = 6;

/** The hum's source in the current room's coordinates, or null when the goal is not seen. */
export interface GoalSource {
  position: THREE.Vector3;
  /** 0 in the goal room, else the portal level it is seen at. */
  level: number;
  attenuationDb: number;
}

export function goalSource(
  current: RoomId,
  goalRoom: RoomId,
  /** The diploma's centre in the goal room's coordinates. */
  goalPosition: THREE.Vector3,
  tree: readonly Pick<PortalTreeEntry, 'room' | 'level' | 'cameraFromRoot'>[],
): GoalSource | null {
  if (current === goalRoom) {
    return { position: goalPosition.clone(), level: 0, attenuationDb: 0 };
  }
  let best: Pick<PortalTreeEntry, 'room' | 'level' | 'cameraFromRoot'> | null = null;
  for (const node of tree) {
    if (node.room !== goalRoom || node.level === 0) continue;
    if (best === null || node.level < best.level) best = node;
  }
  if (best === null) return null;
  // cameraFromRoot maps the current room into the node's room; invert it to bring the goal back.
  const position = goalPosition.clone().applyMatrix4(best.cameraFromRoot.clone().invert());
  return { position, level: best.level, attenuationDb: -HUM_DB_PER_LEVEL * best.level };
}
