/**
 * Pooled render targets for portal passes. Targets are acquired per frame and returned with
 * `releaseAll()` at the start of the next frame; matching sizes are reused, never reallocated.
 */
import * as THREE from 'three';

export interface TargetSpec {
  width: number;
  height: number;
  samples: number;
}

const key = (s: TargetSpec): string => `${s.width}x${s.height}x${s.samples}`;

export class RenderTargetPool {
  private readonly free = new Map<string, THREE.WebGLRenderTarget[]>();
  private readonly used: { key: string; target: THREE.WebGLRenderTarget }[] = [];

  /** @param type texture type: HalfFloat keeps linear colour precise; UnsignedByte as fallback. */
  constructor(private readonly type: THREE.TextureDataType = THREE.HalfFloatType) {}

  /** Returns a target of the given size and MSAA sample count, reusing a free one if possible. */
  acquire(spec: TargetSpec): THREE.WebGLRenderTarget {
    const k = key(spec);
    const list = this.free.get(k);
    const target =
      list?.pop() ??
      new THREE.WebGLRenderTarget(spec.width, spec.height, {
        samples: spec.samples,
        type: this.type,
        depthBuffer: true,
        stencilBuffer: false,
        colorSpace: THREE.LinearSRGBColorSpace,
      });
    this.used.push({ key: k, target });
    return target;
  }

  /** Returns every target acquired since the last call to the free lists. */
  releaseAll(): void {
    for (const { key: k, target } of this.used) {
      const list = this.free.get(k) ?? [];
      list.push(target);
      this.free.set(k, list);
    }
    this.used.length = 0;
  }

  /** Number of targets ever allocated and still alive. */
  size(): number {
    let n = this.used.length;
    for (const list of this.free.values()) n += list.length;
    return n;
  }

  /** Frees every target (on resize, quality change or context loss). */
  dispose(): void {
    this.releaseAll();
    for (const list of this.free.values()) for (const t of list) t.dispose();
    this.free.clear();
  }
}
