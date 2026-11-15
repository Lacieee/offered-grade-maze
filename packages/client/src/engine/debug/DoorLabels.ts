/**
 * In-world door labels for the debug view (CP10 A2): a floating label above every door frame
 * with `d1 → r07.d2` (or "sealed"). They live in the rooms' own scenes, so portals show them
 * like any other object.
 */
import { DOOR_HEIGHT, type DoorId, type LinkDTO } from '@ogm/shared';
import * as THREE from 'three';
import type { RoomView } from '../rooms/buildRoom.js';

/** Label text: `d1 → r07.d2`, or `d1 · <sealed>`. */
export function doorLabelText(door: DoorId, link: LinkDTO | null, sealed: string): string {
  return link ? `${door} → ${link.room}.${link.door}` : `${door} · ${sealed}`;
}

/** Label size in the world (m). */
const LABEL_H = 0.2;

function labelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = 'bold 40px system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 32;
  canvas.width = w;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20, 24, 32, 0.82)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 64, 14);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: w / 64 };
}

export class DoorLabels {
  private readonly byRoom = new Map<string, THREE.Sprite[]>();

  constructor(private readonly sealedText: string) {}

  /** Adds labels to a built room (once). */
  attach(view: RoomView): void {
    if (this.byRoom.has(view.id)) return;
    const sprites: THREE.Sprite[] = [];
    for (const [id, door] of view.doors) {
      const made = labelTexture(doorLabelText(id, door.link, this.sealedText));
      if (!made) continue;
      const material = new THREE.SpriteMaterial({ map: made.texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.name = `doorLabel:${id}`;
      sprite.scale.set(LABEL_H * made.aspect, LABEL_H, 1);
      const { origin, inward } = door.frame;
      sprite.position.set(origin.x + inward.x * 0.1, DOOR_HEIGHT + 0.22, origin.z + inward.z * 0.1);
      // Portal passes use oblique projections, where frustum culling would be wrong.
      sprite.frustumCulled = false;
      view.scene.add(sprite);
      sprites.push(sprite);
    }
    this.byRoom.set(view.id, sprites);
  }

  /** Removes every label from the given rooms and frees them. */
  detachAll(views: Iterable<RoomView>): void {
    for (const view of views) {
      for (const s of this.byRoom.get(view.id) ?? []) view.scene.remove(s);
    }
    this.dispose();
  }

  /** Frees every label (the rooms are being dropped). */
  dispose(): void {
    for (const sprites of this.byRoom.values()) {
      for (const s of sprites) {
        s.material.map?.dispose();
        s.material.dispose();
      }
    }
    this.byRoom.clear();
  }
}
