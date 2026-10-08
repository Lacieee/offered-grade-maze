/**
 * Texture objects for paintings and floors (CP06 T3), generated once per parameter set.
 *
 * Paintings are cached per room (the room disposes them). Floor textures are shared by every
 * room with the same floor kind and colour, and counted: the last room using one disposes it.
 */
import * as THREE from 'three';
import { floorPixels, paintingPixels, type FloorKind, type Pixels } from './pixels.js';

/** A data texture from a pixel buffer (sRGB, mipmapped, repeating). */
export function textureFrom(p: Pixels, repeat: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(p.data, p.width, p.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  // Canvas-style images run top to bottom; flip so row 0 is the top of the picture.
  t.flipY = false;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Cache key of a painting texture. */
export function paintingKey(
  pattern: string,
  seed: number,
  primary: string,
  secondary: string,
): string {
  return `painting:${pattern}:${seed}:${primary}:${secondary}`;
}

/** A painting texture (not cached: the room builder caches by key). */
export function paintingTexture(
  pattern: string,
  seed: number,
  primary: string,
  secondary: string,
): THREE.DataTexture {
  const pixels = paintingPixels(pattern, seed, primary, secondary);
  // Row 0 of the pixels is the top of the picture; WebGL samples row 0 at v = 0 (bottom),
  // so mirror the rows once here.
  const rows = new Uint8Array(pixels.data.length);
  const stride = pixels.width * 4;
  for (let y = 0; y < pixels.height; y++) {
    rows.set(pixels.data.subarray(y * stride, (y + 1) * stride), (pixels.height - 1 - y) * stride);
  }
  return textureFrom({ ...pixels, data: rows }, false);
}

const floors = new Map<string, { texture: THREE.DataTexture; users: number }>();

/** Shared floor texture for a kind and colour; call {@link releaseFloorTexture} when done. */
export function acquireFloorTexture(kind: FloorKind, tint: string): THREE.DataTexture {
  const key = `${kind}:${tint.toLowerCase()}`;
  const cached = floors.get(key);
  if (cached !== undefined) {
    cached.users++;
    return cached.texture;
  }
  const texture = textureFrom(floorPixels(kind, tint), true);
  texture.name = `floor:${key}`;
  floors.set(key, { texture, users: 1 });
  return texture;
}

/** Releases a floor texture; disposes it when no room uses it any more. */
export function releaseFloorTexture(texture: THREE.Texture): void {
  for (const [key, entry] of floors) {
    if (entry.texture !== texture) continue;
    entry.users--;
    if (entry.users <= 0) {
      entry.texture.dispose();
      floors.delete(key);
    }
    return;
  }
}

/** Number of cached floor textures (tests). */
export function floorTextureCount(): number {
  return floors.size;
}
