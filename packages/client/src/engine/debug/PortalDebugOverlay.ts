/**
 * `?portalDebug=1` (dev builds): outlines every portal node's screen rectangle, coloured by
 * recursion level (1 red, 2 green, 3 blue). The level tint itself is done in the portal shader.
 */
import type { PortalTreeEntry } from '../portals/PortalRenderer.js';

const LEVEL_COLORS = ['#ffffff', '#ff4040', '#40ff40', '#4080ff', '#ffff40'];

export class PortalDebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(private readonly host: HTMLCanvasElement) {
    this.canvas = host.ownerDocument.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    this.canvas.dataset.testid = 'portal-debug';
    host.parentElement?.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /** Draws the rectangles of the last frame's portal tree. */
  draw(tree: readonly PortalTreeEntry[]): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    ctx.font = '11px ui-monospace, monospace';
    for (const node of tree) {
      if (node.level === 0) continue;
      const color = LEVEL_COLORS[node.level] ?? '#ffffff';
      const x = node.rect.x0 * w;
      const y = (1 - node.rect.y1) * h;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.strokeRect(x, y, (node.rect.x1 - node.rect.x0) * w, (node.rect.y1 - node.rect.y0) * h);
      ctx.fillText(`L${node.level} ${node.room}`, x + 3, y + 12);
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
