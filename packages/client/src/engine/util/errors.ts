/** Thrown by `Engine.init` when the browser cannot run the game (no WebGL2). */
export class UnsupportedError extends Error {
  /** @param reason short machine-readable reason, e.g. `webgl2`. */
  constructor(readonly reason: 'webgl2') {
    super('This game needs a desktop browser with WebGL2.');
    this.name = 'UnsupportedError';
  }
}
