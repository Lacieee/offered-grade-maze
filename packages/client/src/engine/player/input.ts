/**
 * Keyboard and mouse input.
 *
 * Keys are read by physical position (`KeyboardEvent.code`), never by `key`, so WASD works
 * the same on QWERTY, QWERTZ (Hungarian) and AZERTY layouts. Input only counts while the
 * pointer is locked; losing the lock clears every held key.
 */
import type { MoveIntent } from './physics.js';

/** Movement key bindings by `KeyboardEvent.code`. */
export const MOVE_BINDINGS: Readonly<Record<string, keyof MoveIntent>> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
};

/** The parts of a `KeyboardEvent` that input handling reads. */
export interface KeyLike {
  code: string;
  repeat: boolean;
}

/** Input state, independent of the DOM so it can be unit-tested. */
export class InputState {
  private readonly held = new Set<keyof MoveIntent>();
  private lookDx = 0;
  private lookDy = 0;
  private locked = false;
  /** The first movement after gaining the lock is the pointer's jump, not the player's. */
  private skipMove = false;

  /** Whether the pointer is locked (input is live). */
  get isLocked(): boolean {
    return this.locked;
  }

  /** Updates the lock state. Losing the lock clears all keys and pending look. */
  setLocked(locked: boolean): void {
    if (locked && !this.locked) this.skipMove = true;
    this.locked = locked;
    if (!locked) this.clear();
  }

  /** Handles a key press. Returns true if it was a movement key (the caller may prevent default). */
  keyDown(e: KeyLike): boolean {
    const action = MOVE_BINDINGS[e.code];
    if (action === undefined) return false;
    if (!e.repeat && this.locked) this.held.add(action);
    return true;
  }

  /** Handles a key release. */
  keyUp(e: KeyLike): boolean {
    const action = MOVE_BINDINGS[e.code];
    if (action === undefined) return false;
    this.held.delete(action);
    return true;
  }

  /** Accumulates mouse movement (pixels) while locked. */
  mouseMove(dx: number, dy: number): void {
    if (!this.locked) return;
    if (this.skipMove) {
      this.skipMove = false;
      return;
    }
    this.lookDx += dx;
    this.lookDy += dy;
  }

  /** Releases every key and drops pending look movement (window blur, lock loss). */
  clear(): void {
    this.held.clear();
    this.lookDx = 0;
    this.lookDy = 0;
  }

  /** Currently held movement keys. */
  intent(): MoveIntent {
    return {
      forward: this.held.has('forward'),
      back: this.held.has('back'),
      left: this.held.has('left'),
      right: this.held.has('right'),
    };
  }

  /** Returns and resets the accumulated mouse movement. */
  consumeLook(): { dx: number; dy: number } {
    const look = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    return look;
  }
}

/**
 * Requests Pointer Lock with raw mouse input where supported (`unadjustedMovement`), falling
 * back to a plain request when the browser rejects the option (Safari). Never throws and
 * never leaves an unhandled rejection (a fast re-lock after Esc is refused by browsers).
 */
export async function requestPointerLock(el: HTMLElement): Promise<void> {
  try {
    await el.requestPointerLock({ unadjustedMovement: true });
  } catch {
    try {
      await el.requestPointerLock();
    } catch {
      // Refused (e.g. too soon after Esc); the next click tries again.
    }
  }
}

/** Wires DOM events to an {@link InputState}. Returns a function that unbinds everything. */
export function bindInput(
  canvas: HTMLCanvasElement,
  input: InputState,
  onLockChange: (locked: boolean) => void,
): () => void {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView ?? window;

  const onClick = (): void => {
    if (doc.pointerLockElement !== canvas) void requestPointerLock(canvas);
  };
  const onLock = (): void => {
    const locked = doc.pointerLockElement === canvas;
    input.setLocked(locked);
    onLockChange(locked);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (input.keyDown(e) && input.isLocked) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    input.keyUp(e);
  };
  const onMouseMove = (e: MouseEvent): void => {
    input.mouseMove(e.movementX, e.movementY);
  };
  const onBlur = (): void => {
    input.clear();
  };

  canvas.addEventListener('click', onClick);
  doc.addEventListener('pointerlockchange', onLock);
  doc.addEventListener('mousemove', onMouseMove);
  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);

  return () => {
    canvas.removeEventListener('click', onClick);
    doc.removeEventListener('pointerlockchange', onLock);
    doc.removeEventListener('mousemove', onMouseMove);
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('keyup', onKeyUp);
    win.removeEventListener('blur', onBlur);
    if (doc.pointerLockElement === canvas) doc.exitPointerLock();
  };
}
