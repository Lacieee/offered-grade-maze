/** Linear interpolation from a (t = 0) to b (t = 1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamps v to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Degrees to radians. */
export function deg(d: number): number {
  return (d * Math.PI) / 180;
}
