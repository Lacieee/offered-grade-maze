import { describe, expect, it, vi } from 'vitest';
import { InputState, MOVE_BINDINGS, requestPointerLock } from './input.js';
import { wishDirection } from './physics.js';

/** A key press as different keyboard layouts report the same physical key. */
const press = (code: string, key: string, repeat = false) => ({ code, key, repeat });

function locked(): InputState {
  const input = new InputState();
  input.setLocked(true);
  // The first movement after locking is dropped (the pointer's jump).
  input.mouseMove(0, 0);
  return input;
}

describe('InputState', () => {
  it('maps WASD by physical position (event.code), whatever the layout prints', () => {
    // Physical W key: QWERTY and QWERTZ print "w", AZERTY prints "z".
    for (const key of ['w', 'z', 'W']) {
      const input = locked();
      input.keyDown(press('KeyW', key));
      expect(input.intent()).toEqual({ forward: true, back: false, left: false, right: false });
    }
    // Physical A key prints "q" on AZERTY: still "left".
    const input = locked();
    input.keyDown(press('KeyA', 'q'));
    expect(input.intent().left).toBe(true);
  });

  it('ignores event.key: the QWERTZ "z" key (code KeyY) is not a movement key', () => {
    const input = locked();
    expect(input.keyDown(press('KeyY', 'z'))).toBe(false);
    expect(input.keyDown(press('KeyZ', 'w'))).toBe(false);
    expect(input.intent()).toEqual({ forward: false, back: false, left: false, right: false });
  });

  it('moves along the camera heading on QWERTY and QWERTZ alike', () => {
    for (const layout of [
      { forward: press('KeyW', 'w'), right: press('KeyD', 'd') },
      { forward: press('KeyW', 'w'), right: press('KeyD', 'd') }, // QWERTZ: same codes
    ]) {
      const input = locked();
      input.keyDown(layout.forward);
      input.keyDown(layout.right);
      const wish = wishDirection(input.intent(), 0);
      expect(wish.x).toBeCloseTo(Math.SQRT1_2);
      expect(wish.z).toBeCloseTo(-Math.SQRT1_2);
    }
  });

  it('binds exactly W, A, S and D', () => {
    expect(Object.keys(MOVE_BINDINGS).sort()).toEqual(['KeyA', 'KeyD', 'KeyS', 'KeyW']);
  });

  it('ignores key repeat and releases on key up', () => {
    const input = locked();
    input.keyDown(press('KeyS', 's'));
    input.keyUp(press('KeyS', 's'));
    input.keyDown(press('KeyS', 's', true)); // auto-repeat after release must not re-press
    expect(input.intent().back).toBe(false);
  });

  it('ignores keys and mouse movement while unlocked', () => {
    const input = new InputState();
    input.keyDown(press('KeyW', 'w'));
    input.mouseMove(10, 5);
    expect(input.intent().forward).toBe(false);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('clears held keys and pending look when the lock is lost', () => {
    const input = locked();
    input.keyDown(press('KeyW', 'w'));
    input.mouseMove(4, -2);
    input.setLocked(false);
    expect(input.intent().forward).toBe(false);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('accumulates and consumes mouse movement', () => {
    const input = locked();
    input.mouseMove(3, 1);
    input.mouseMove(2, -4);
    expect(input.consumeLook()).toEqual({ dx: 5, dy: -3 });
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  // CP08: Chrome reports the pointer's jump to the lock position as the first movement
  // (seen as -480, -270 on a 960 × 540 page), which tilted the view at the Ready click.
  it('drops the first mouse movement after the lock is gained', () => {
    const input = new InputState();
    input.setLocked(true);
    input.mouseMove(-480, -270);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
    input.mouseMove(3, -2);
    expect(input.consumeLook()).toEqual({ dx: 3, dy: -2 });
    // Again after the lock is lost and regained.
    input.setLocked(false);
    input.setLocked(true);
    input.mouseMove(400, 200);
    input.mouseMove(1, 1);
    expect(input.consumeLook()).toEqual({ dx: 1, dy: 1 });
  });

  it('clear() releases everything (window blur)', () => {
    const input = locked();
    input.keyDown(press('KeyD', 'd'));
    input.clear();
    expect(input.intent().right).toBe(false);
  });
});

describe('requestPointerLock', () => {
  it('asks for unadjusted movement first', async () => {
    const el = { requestPointerLock: vi.fn(() => Promise.resolve()) };
    await requestPointerLock(el as unknown as HTMLElement);
    expect(el.requestPointerLock).toHaveBeenCalledWith({ unadjustedMovement: true });
    expect(el.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain request when the option is rejected (Safari)', async () => {
    const el = {
      requestPointerLock: vi
        .fn<(o?: unknown) => Promise<void>>()
        .mockRejectedValueOnce(new Error('NotSupportedError'))
        .mockResolvedValueOnce(undefined),
    };
    await requestPointerLock(el as unknown as HTMLElement);
    expect(el.requestPointerLock).toHaveBeenNthCalledWith(2);
  });

  it('swallows a refused request instead of leaving an unhandled rejection', async () => {
    const el = { requestPointerLock: vi.fn(() => Promise.reject(new Error('SecurityError'))) };
    await expect(requestPointerLock(el as unknown as HTMLElement)).resolves.toBeUndefined();
  });

  it('copes with browsers that return undefined instead of a promise', async () => {
    const el = { requestPointerLock: vi.fn(() => undefined) };
    await expect(requestPointerLock(el as unknown as HTMLElement)).resolves.toBeUndefined();
  });
});
