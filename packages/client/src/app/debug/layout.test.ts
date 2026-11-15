import type { DebugResponse, DebugRoomDTO } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { NODE_W, layoutGraph, pathLinks, pathText } from './layout.js';

const room = (
  id: string,
  depth: number,
  doors: [string, { room: string; door: string } | null][],
  twinOf: string | null = null,
): DebugRoomDTO => ({
  id,
  type: 'living',
  label: 'room.living',
  depth,
  onSpine: false,
  twinOf,
  doors: doors.map(([d, link]) => ({ id: d, wall: 'N', link })),
});

/** r00 ↔ r01 (reciprocal), r01 → r02 one way, r02 → r00 back, r02 self-link, a sealed door. */
const ROOMS: DebugResponse['rooms'] = [
  room('r01', 1, [
    ['d0', { room: 'r00', door: 'd0' }],
    ['d1', { room: 'r02', door: 'd0' }],
  ]),
  room('r00', 0, [
    ['d0', { room: 'r01', door: 'd0' }],
    ['d1', null],
  ]),
  room(
    'r02',
    2,
    [
      ['d0', { room: 'r00', door: 'd1' }],
      ['d1', { room: 'r02', door: 'd2' }],
      ['d2', { room: 'r02', door: 'd1' }],
    ],
    'r00',
  ),
  room('r03', 1, [['d0', { room: 'r02', door: 'd0' }]]),
];

describe('debug view layout (CP10 A2)', () => {
  it('layers by depth left to right, sorted by id within a layer', () => {
    const g = layoutGraph({ rooms: ROOMS });
    const x = (id: string) => g.nodes.get(id)?.x ?? -1;
    const y = (id: string) => g.nodes.get(id)?.y ?? -1;
    expect(x('r00')).toBe(0);
    expect(x('r01')).toBe(x('r03'));
    expect(x('r01')).toBeGreaterThan(x('r00'));
    expect(x('r02')).toBeGreaterThan(x('r01'));
    expect(y('r01')).toBeLessThan(y('r03'));
    expect(g.width).toBe(x('r02') + NODE_W);
    // Boxes in a column never overlap; every door has a row.
    const r01 = g.nodes.get('r01');
    const r03 = g.nodes.get('r03');
    expect((r01?.y ?? 0) + (r01?.h ?? 0)).toBeLessThan(r03?.y ?? 0);
    expect([...(g.nodes.get('r02')?.doorY.keys() ?? [])]).toEqual(['d0', 'd1', 'd2']);
  });

  it('classifies links: reciprocal pairs once, one-way, self-links; sealed doors; twins', () => {
    const g = layoutGraph({ rooms: ROOMS });
    const kinds = g.edges.map(
      (e) => `${e.kind} ${e.from.room}.${e.from.door}→${e.to.room}.${e.to.door}`,
    );
    expect(kinds).toEqual([
      'reciprocal r00.d0→r01.d0',
      'oneWay r01.d1→r02.d0',
      'oneWay r02.d0→r00.d1',
      'self r02.d1→r02.d2',
      'self r02.d2→r02.d1',
      'oneWay r03.d0→r02.d0',
    ]);
    expect(g.edges[0]?.label).toBe('d0↔d0');
    expect(g.sealed).toEqual([{ room: 'r00', door: 'd1' }]);
    expect(g.twins).toEqual([{ twin: 'r02', original: 'r00' }]);
  });

  it('path text: START (…) → room [exit→arrive] → … → GOAL (…)', () => {
    const name = (id: string) =>
      ({ r03: 'Living room', r07: 'Kitchen', r09: 'Bathroom' })[id] ?? '?';
    const path = [
      { room: 'r03', arriveDoor: null, exitDoor: 'd1' },
      { room: 'r07', arriveDoor: 'd2', exitDoor: 'd0' },
      { room: 'r09', arriveDoor: 'd3', exitDoor: null },
    ];
    expect(pathText(path, name)).toBe(
      'START (Living room r03) → Kitchen r07 [d1→d2] → GOAL (Bathroom r09)',
    );
    expect(pathText([{ room: 'r09', arriveDoor: null, exitDoor: null }], name)).toBe(
      'START = GOAL (Bathroom r09)',
    );
    expect(pathText(path, name, { start: 'START', goal: 'CÉL' })).toMatch(
      /→ CÉL \(Bathroom r09\)$/,
    );
    expect([...pathLinks(path)]).toEqual(['r03.d1', 'r07.d0']);
  });
});
