/**
 * The debug view (CP10 A2): the house's real graph and a guaranteed path, over the running
 * game (PD1, PD6). Loaded on first open (code-split). React + SVG, no graph library.
 */
import type { DebugResponse, RoomId } from '@ogm/shared';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { GameController } from '../game/controller.js';
import { formatClock, useGame } from '../game/store.js';
import { isMessageKey, useT } from '../i18n/index.js';
import { layoutGraph, pathLinks, pathText, type GraphLayout, type NodeBox } from './layout.js';

const METRICS = [
  'asymmetricShare',
  'selfLinks',
  'sealedDoors',
  'longBackLinks',
  'twins',
  'misleadingDoors',
  'shortest',
] as const;

/** The live game clock (it never pauses, PD1); written outside React like the HUD's. */
function Elapsed() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      const { startedAt, stoppedAt } = useGame.getState();
      if (ref.current && startedAt !== null) {
        ref.current.textContent = formatClock((stoppedAt ?? performance.now()) - startedAt);
      }
    };
    update();
    const id = setInterval(update, 250);
    return () => {
      clearInterval(id);
    };
  }, []);
  return <span ref={ref} />;
}

export default function DebugOverlay({ game }: { game: GameController }) {
  const t = useT();
  const data = useGame((s) => s.debugData);
  const failed = useGame((s) => s.debugFailed);
  const labels = useGame((s) => s.doorLabels);
  const [fromStart, setFromStart] = useState(false);
  return (
    <div className="debug-backdrop" data-testid="debug-overlay" role="dialog" aria-modal="true">
      <div className="debug-panel">
        <header className="debug-head">
          <h2>{t('debug.title')}</h2>
          <p className="debug-hint">{t('debug.hint')}</p>
          <button
            type="button"
            className="debug-close"
            onClick={() => {
              game.closeDebug();
            }}
          >
            {t('debug.close')}
          </button>
        </header>
        {data ? (
          <>
            <Facts data={data} />
            <div className="debug-tools">
              <label>
                <input
                  type="checkbox"
                  data-testid="debug-from-start"
                  checked={fromStart}
                  onChange={(e) => {
                    setFromStart(e.target.checked);
                  }}
                />{' '}
                {t('debug.pathFromStart')}
              </label>
              <label>
                <input
                  type="checkbox"
                  data-testid="debug-labels"
                  checked={labels}
                  onChange={(e) => {
                    game.setDoorLabels(e.target.checked, t('debug.sealed'));
                  }}
                />{' '}
                {t('debug.labels')}
              </label>
              <span className="debug-legend">{t('debug.legend')}</span>
            </div>
            <Graph data={data} fromStart={fromStart} />
            <PathLine data={data} fromStart={fromStart} />
          </>
        ) : (
          <p className="debug-status">{failed ? t('debug.failed') : t('debug.loading')}</p>
        )}
      </div>
    </div>
  );
}

function Facts({ data }: { data: DebugResponse }) {
  const t = useT();
  const doors = data.rooms.reduce((n, r) => n + r.doors.length, 0);
  const metric = (key: (typeof METRICS)[number]): string => {
    const v = data.metrics[key];
    if (v === undefined) return '–';
    // The generator reports the asymmetric share per mille.
    return key === 'asymmetricShare' ? `${(v / 10).toFixed(1)} %` : String(v);
  };
  const difficultyKey = `difficulty.${data.difficulty}`;
  return (
    <dl className="debug-facts" data-testid="debug-facts">
      <div>
        <dt>{t('debug.seed')}</dt>
        <dd data-testid="debug-seed">{data.seed}</dd>
      </div>
      <div>
        <dt>{t('debug.difficulty')}</dt>
        <dd>{isMessageKey(difficultyKey) ? t(difficultyKey) : data.difficulty}</dd>
      </div>
      <div>
        <dt>{t('debug.generator')}</dt>
        <dd>v{data.generatorVersion}</dd>
      </div>
      <div>
        <dt>{t('debug.levelHash')}</dt>
        <dd>{data.levelHash.slice(0, 12)}</dd>
      </div>
      <div>
        <dt>{t('debug.rooms')}</dt>
        <dd>{data.rooms.length}</dd>
      </div>
      <div>
        <dt>{t('debug.doors')}</dt>
        <dd>{doors}</dd>
      </div>
      {METRICS.map((m) => (
        <div key={m}>
          <dt>{t(`debug.metric.${m}`)}</dt>
          <dd>{metric(m)}</dd>
        </div>
      ))}
      <div>
        <dt>{t('debug.elapsed')}</dt>
        <dd data-testid="debug-elapsed">
          <Elapsed />
        </dd>
      </div>
    </dl>
  );
}

/** A room's localised type name. */
function useRoomName(data: DebugResponse): (id: RoomId) => string {
  const t = useT();
  return (id) => {
    const label = data.rooms.find((r) => r.id === id)?.label ?? '';
    return isMessageKey(label) ? t(label) : label;
  };
}

function PathLine({ data, fromStart }: { data: DebugResponse; fromStart: boolean }) {
  const t = useT();
  const name = useRoomName(data);
  const path = fromStart ? data.pathFromStart : data.pathFromCurrent;
  return (
    <p className="debug-path">
      <strong>{t('debug.path')}: </strong>
      <span data-testid="debug-path-text">
        {pathText(path, name, { start: t('debug.start'), goal: t('debug.goal') })}
      </span>
    </p>
  );
}

/** Door anchor on a box edge: the side facing `towardX`. */
function anchor(
  node: NodeBox,
  door: string,
  towardX: number,
): { x: number; y: number; side: 1 | -1 } {
  const y = node.doorY.get(door) ?? node.y + node.h / 2;
  const right = towardX >= node.x + node.w / 2;
  return { x: right ? node.x + node.w : node.x, y, side: right ? 1 : -1 };
}

/** The SVG path of a link from a door to a target box (or door row). */
function linkPath(
  g: GraphLayout,
  from: { room: RoomId; door: string },
  to: { room: RoomId; door: string },
): string {
  const a = g.nodes.get(from.room);
  const b = g.nodes.get(to.room);
  if (!a || !b) return '';
  if (a === b) {
    // Self-link: a loop out of the right edge, from one door row to the other.
    const p = anchor(a, from.door, Infinity);
    const q = anchor(a, to.door, Infinity);
    const out = 34 + Math.abs(p.y - q.y) * 0.3;
    return `M ${p.x} ${p.y} C ${p.x + out} ${p.y}, ${q.x + out} ${q.y}, ${q.x + 4} ${q.y}`;
  }
  const p = anchor(a, from.door, b.x + b.w / 2);
  const q = anchor(b, to.door, a.x + a.w / 2);
  const bend = Math.max(40, Math.abs(q.x - p.x) * 0.4);
  const sameColumn = a.x === b.x;
  const c1x = p.x + p.side * bend;
  const c2x = sameColumn ? q.x + q.side * bend : q.x + q.side * bend;
  const end = q.x + q.side * 4;
  return `M ${p.x} ${p.y} C ${c1x} ${p.y}, ${c2x} ${q.y}, ${end} ${q.y}`;
}

function Graph({ data, fromStart }: { data: DebugResponse; fromStart: boolean }) {
  const t = useT();
  const name = useRoomName(data);
  const g = useMemo(() => layoutGraph(data), [data]);
  const path = fromStart ? data.pathFromStart : data.pathFromCurrent;
  const onPath = useMemo(() => pathLinks(path), [path]);
  const [view, setView] = useState({ x: -40, y: -40, scale: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pad = 80;
  const vbW = (g.width + pad * 2) / view.scale;
  const vbH = (g.height + pad * 2) / view.scale;

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({ ...v, scale: Math.min(4, Math.max(0.3, v.scale * factor)) }));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const k = vbW / Math.max(1, rect.width);
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const edgeKey = (e: GraphLayout['edges'][number]) => `${e.from.room}.${e.from.door}`;
  const hovered = g.edges.find((e) => edgeKey(e) === hover);
  return (
    <svg
      className="debug-graph"
      data-testid="debug-graph"
      viewBox={`${view.x} ${view.y} ${vbW} ${vbH}`}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <defs>
        <marker
          id="dbg-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="dbg-arrowhead" />
        </marker>
        <marker
          id="dbg-arrow-path"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="dbg-arrowhead-path" />
        </marker>
      </defs>

      {/* Twins: a thin dotted line to the original. */}
      {g.twins.map(({ twin, original }) => {
        const a = g.nodes.get(twin);
        const b = g.nodes.get(original);
        if (!a || !b) return null;
        return (
          <line
            key={`twin-${twin}`}
            className="dbg-twin"
            x1={a.x + a.w / 2}
            y1={a.y}
            x2={b.x + b.w / 2}
            y2={b.y + b.h}
          />
        );
      })}

      {/* Links. */}
      {g.edges.map((e) => {
        const key = edgeKey(e);
        return (
          <path
            key={key}
            d={linkPath(g, e.from, e.to)}
            className={`dbg-link dbg-${e.kind}`}
            markerEnd="url(#dbg-arrow)"
            markerStart={e.kind === 'reciprocal' ? 'url(#dbg-arrow)' : undefined}
            onPointerEnter={() => {
              setHover(key);
            }}
            onPointerLeave={() => {
              setHover(null);
            }}
          >
            <title>{e.label}</title>
          </path>
        );
      })}

      {/* The guaranteed path, above every other link. */}
      {path.flatMap((step, i) => {
        const next = path[i + 1];
        if (step.exitDoor === null || !next || !onPath.has(`${step.room}.${step.exitDoor}`))
          return [];
        return [
          <path
            key={`path-${String(i)}`}
            data-testid="debug-path-link"
            d={linkPath(
              g,
              { room: step.room, door: step.exitDoor },
              { room: next.room, door: next.arriveDoor ?? '' },
            )}
            className="dbg-path"
            markerEnd="url(#dbg-arrow-path)"
          >
            <title>{`${step.exitDoor}→${next.arriveDoor ?? ''}`}</title>
          </path>,
        ];
      })}

      {/* Rooms. */}
      {[...g.nodes.values()].map((n) => {
        const r = n.room;
        const cls = [
          'dbg-node',
          r.id === data.start ? 'dbg-start' : '',
          r.id === data.goal ? 'dbg-goal' : '',
          r.id === data.current ? 'dbg-current' : '',
        ].join(' ');
        return (
          <g key={r.id} data-testid={`debug-node-${r.id}`} className={cls}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} />
            <text x={n.x + 8} y={n.y + 17} className="dbg-title">
              {`${name(r.id)} · ${r.id}`}
              {r.twinOf ? ' ⧉' : ''}
              {r.twinOf ? <title>{t('debug.twinOf', { room: r.twinOf })}</title> : null}
            </text>
            {[...r.doors]
              .sort((a, b) => (a.id < b.id ? -1 : 1))
              .map((d) => {
                const y = n.doorY.get(d.id) ?? 0;
                return (
                  <g key={d.id}>
                    <text x={n.x + 10} y={y + 4} className="dbg-door">
                      {d.link
                        ? `${d.id} → ${d.link.room}.${d.link.door}`
                        : `${d.id} · ${t('debug.sealed')}`}
                    </text>
                    {d.link === null && (
                      // Sealed: a small crossed square on the box edge.
                      <g className="dbg-sealed">
                        <rect x={n.x - 5} y={y - 5} width={10} height={10} />
                        <path
                          d={`M ${n.x - 5} ${y - 5} L ${n.x + 5} ${y + 5} M ${n.x + 5} ${y - 5} L ${n.x - 5} ${y + 5}`}
                        />
                      </g>
                    )}
                  </g>
                );
              })}
          </g>
        );
      })}

      {hovered && <HoverLabel g={g} edge={hovered} />}
    </svg>
  );
}

function HoverLabel({ g, edge }: { g: GraphLayout; edge: GraphLayout['edges'][number] }) {
  const a = g.nodes.get(edge.from.room);
  const b = g.nodes.get(edge.to.room);
  if (!a || !b) return null;
  const x = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
  const y = ((a.doorY.get(edge.from.door) ?? a.y) + (b.doorY.get(edge.to.door) ?? b.y)) / 2;
  return (
    <text x={x} y={y - 6} className="dbg-hover" data-testid="debug-hover">
      {edge.label}
    </text>
  );
}
