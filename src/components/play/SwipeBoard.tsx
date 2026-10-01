"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CARD_RULES, getCard } from "@/lib/game/cards";
import { isAdjacent, tileLabel } from "@/lib/game/board";
import type { ActiveEffect, Board } from "@/lib/game/types";
import { vibrate } from "@/lib/client/haptics";
import { play } from "@/lib/client/sound";
import { composeEffects } from "./effects";

/** Board padding as a fraction of its width. */
const PAD = 0.04;
/** While dragging, a tile only registers within this radius (in cell units) so diagonals don't clip neighbours. */
const DRAG_HIT_RADIUS = 0.42;
/** The first touch picks the nearest tile anywhere inside its cell (corners included). */
const START_HIT_RADIUS = 0.75;
/** Fast swipes are resampled at this spacing (cell units) so no tile in between is skipped. */
const SAMPLE_STEP = 0.2;
/** Moving this far (cell units) cancels an ink wipe and starts a normal drag instead. */
const HOLD_SLOP = 0.35;

interface Props {
  board: Board;
  path: number[];
  onPathChange: (path: number[]) => void;
  /** Called when a drag gesture ends (not for taps). */
  onDragEnd: (path: number[]) => void;
  disabled?: boolean;
  hintTile?: number | null;
  /** Sabotage effects on this player. Purely visual: tile ids and adjacency never change. */
  effects?: ActiveEffect[];
  now: number;
  calm?: boolean;
}

interface Gesture {
  pointerId: number;
  moved: boolean;
  tappedLast: boolean;
  /** Last processed pointer position (client px). */
  x: number;
  y: number;
  hold: { tile: number; x0: number; y0: number; timer: ReturnType<typeof setTimeout>; done: boolean } | null;
}

export function SwipeBoard({ board, path, onPathChange, onDragEnd, disabled = false, hintTile = null, effects = [], now, calm = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef(path);
  useLayoutEffect(() => {
    pathRef.current = path;
  }, [path]);
  const gesture = useRef<Gesture | null>(null);
  const size = board.size;

  const fx = composeEffects(effects, now, calm, size);
  const inkEffect = effects.find((e) => e.effectType === "ink" && e.expiresAt > now);
  const [wiped, setWiped] = useState<Set<string>>(() => new Set());
  const [holding, setHolding] = useState<number | null>(null);
  const [rattle, setRattle] = useState<{ tile: number; at: number } | null>(null);
  const inkKey = (i: number) => `${inkEffect?.id}:${i}`;
  const isInked = (i: number) => !!fx.tiles[i]?.ink && !wiped.has(inkKey(i));
  const isLocked = (i: number) => !!fx.tiles[i]?.locked;

  // Any in-flight hold timer dies with the board.
  useEffect(() => () => clearTimeout(gesture.current?.hold?.timer), []);
  useEffect(() => {
    if (!rattle) return;
    const t = setTimeout(() => setRattle(null), 320);
    return () => clearTimeout(t);
  }, [rattle]);

  const setPath = (next: number[]) => {
    if (next.length > pathRef.current.length) {
      vibrate("tap");
      play("tap");
    }
    pathRef.current = next;
    onPathChange(next);
  };

  /** Where each tile's cell is on screen right now (follows spin, mirror and scramble). */
  const measure = () => {
    const root = ref.current!;
    const centers: [number, number][] = [];
    root.querySelectorAll<HTMLElement>("[data-cell]").forEach((el) => {
      const r = el.getBoundingClientRect();
      centers[Number(el.dataset.cell)] = [r.left + r.width / 2, r.top + r.height / 2];
    });
    return { centers, cell: (root.clientWidth * (1 - 2 * PAD)) / size };
  };

  const nearest = (x: number, y: number, { centers, cell }: ReturnType<typeof measure>, radius: number): number | null => {
    let best: number | null = null;
    let bestDist = radius * cell;
    centers.forEach(([cx, cy], i) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  /** Starting a gesture on tile t. Returns true when t was already the last tile (a tap there removes it). */
  const begin = (t: number): boolean => {
    const current = pathRef.current;
    const last = current.at(-1);
    if (t === last) return true;
    if (last !== undefined && !current.includes(t) && isAdjacent(size, last, t)) setPath([...current, t]);
    else if (current.includes(t)) setPath(current.slice(0, current.indexOf(t) + 1));
    else setPath([t]);
    return false;
  };

  /** Dragging over tile t: extend, or step back onto the previous tile to undo. */
  const step = (g: Gesture, t: number | null) => {
    const current = pathRef.current;
    const last = current.at(-1);
    if (t === null || t === last || last === undefined || isLocked(t)) return;
    if (current.length >= 2 && t === current[current.length - 2]) setPath(current.slice(0, -1));
    else if (!current.includes(t) && isAdjacent(size, last, t)) setPath([...current, t]);
    else return;
    g.moved = true;
  };

  const moveLight = (e: PointerEvent<HTMLDivElement> | null) => {
    const root = ref.current;
    if (!root) return;
    if (!e) {
      root.style.setProperty("--lx", "-50%");
      root.style.setProperty("--ly", "-50%");
      return;
    }
    const r = root.getBoundingClientRect();
    root.style.setProperty("--lx", `${e.clientX - r.left}px`);
    root.style.setProperty("--ly", `${e.clientY - r.top}px`);
  };

  const endHold = (g: Gesture) => {
    if (g.hold) clearTimeout(g.hold.timer);
    setHolding(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || gesture.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    moveLight(e);
    const m = measure();
    const t = nearest(e.clientX, e.clientY, m, START_HIT_RADIUS);
    if (t === null) return;
    if (isLocked(t)) {
      vibrate("error");
      setRattle({ tile: t, at: Date.now() });
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released; the gesture still works without capture
    }
    const g: Gesture = { pointerId: e.pointerId, moved: false, tappedLast: false, x: e.clientX, y: e.clientY, hold: null };
    gesture.current = g;
    if (isInked(t)) {
      const key = inkKey(t);
      const timer = setTimeout(() => {
        if (g.hold) g.hold.done = true;
        setHolding(null);
        setWiped((w) => new Set(w).add(key));
        vibrate("success");
        play("point");
      }, CARD_RULES.inkWipeHoldMs);
      g.hold = { tile: t, x0: e.clientX, y0: e.clientY, timer, done: false };
      setHolding(t);
      return;
    }
    g.tappedLast = begin(t);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    moveLight(e);
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId || disabled) return;
    const m = measure();
    if (g.hold) {
      if (g.hold.done) return;
      if (Math.hypot(e.clientX - g.hold.x0, e.clientY - g.hold.y0) < HOLD_SLOP * m.cell) return;
      // Moved off before the wipe finished: it's a drag that started on the inked tile.
      endHold(g);
      g.tappedLast = begin(g.hold.tile);
      g.hold = null;
    }
    const points = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const p of points.length > 0 ? points : [e]) {
      const dx = p.clientX - g.x;
      const dy = p.clientY - g.y;
      const samples = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (SAMPLE_STEP * m.cell)));
      for (let s = 1; s <= samples; s++) {
        step(g, nearest(g.x + (dx * s) / samples, g.y + (dy * s) / samples, m, DRAG_HIT_RADIUS));
      }
      g.x = p.clientX;
      g.y = p.clientY;
    }
  };

  const finish = (e: PointerEvent<HTMLDivElement>, submit: boolean) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gesture.current = null;
    if (e.pointerType !== "mouse") moveLight(null);
    if (g.hold) {
      endHold(g);
      // Released before the wipe finished: treat it as a normal tap on the inked tile.
      if (!g.hold.done && submit) begin(g.hold.tile);
      return;
    }
    if (!submit) return;
    if (g.moved) onDragEnd(pathRef.current);
    else if (g.tappedLast) setPath(pathRef.current.slice(0, -1));
  };

  const slotOf = (i: number) => fx.slots?.[i] ?? i;
  const center = (i: number) => {
    const slot = slotOf(i);
    const cell = 100 / size;
    return [((slot % size) + 0.5) * cell, (Math.floor(slot / size) + 0.5) * cell];
  };

  let layer: ReactNode = (
    <div className="relative h-full w-full" style={fx.layerStyle}>
      {board.tiles.map((tile, i) => {
        const slot = slotOf(i);
        const mods = fx.tiles[i] ?? {};
        const selected = path.includes(i);
        const isLast = path.at(-1) === i;
        const inked = isInked(i);
        const scale = mods.letterScale ?? 1;
        return (
          <div
            key={i}
            data-cell={i}
            className="absolute p-[8%]"
            style={{
              left: `${((slot % size) * 100) / size}%`,
              top: `${(Math.floor(slot / size) * 100) / size}%`,
              width: `${100 / size}%`,
              height: `${100 / size}%`,
              transition: calm ? undefined : "left 450ms cubic-bezier(0.3, 1.3, 0.5, 1), top 450ms cubic-bezier(0.3, 1.3, 0.5, 1)",
            }}
            role="gridcell"
            aria-selected={selected}
            aria-label={mods.locked ? `${tileLabel(tile)}, locked` : mods.hidden || inked ? "Hidden tile" : tileLabel(tile)}
          >
            <div
              className={`relative grid h-full w-full place-items-center overflow-hidden rounded-[18%] font-black transition-colors duration-100 ${
                selected
                  ? "scale-95 bg-amber text-ink-950 shadow-[0_0.5cqw_0_#b37b00]"
                  : mods.locked
                    ? "bg-ink-500/50 text-ink-300 shadow-[0_1cqw_0_#141c45]"
                    : mods.hidden
                      ? "bg-[radial-gradient(circle,#1b1033,#0b1027)] text-transparent shadow-[0_1cqw_0_#05070f]"
                      : "bg-cream text-tile-ink shadow-[0_1cqw_0_var(--color-tile-edge)]"
              } ${isLast ? "ring-4 ring-white" : ""} ${hintTile === i && !selected ? "animate-pulse-soft ring-[1.2cqw] ring-sky" : ""} ${
                rattle?.tile === i ? "animate-shake" : ""
              }`}
              style={mods.faceStyle}
            >
              <span style={{ fontSize: `${(tile === "qu" ? 9 : 12) * scale}cqw` }} className={mods.hidden && !selected ? "invisible" : ""}>
                {tileLabel(tile)}
              </span>
              {mods.locked && (
                <span className="absolute right-[6%] top-[2%] text-[5cqw]" aria-hidden>
                  🔒
                </span>
              )}
              {inked && <InkBlob seed={i} wiping={holding === i} />}
            </div>
          </div>
        );
      })}
      {path.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <polyline
            points={path.map((i) => center(i).join(",")).join(" ")}
            fill="none"
            stroke="white"
            strokeOpacity={0.75}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
  for (const { key, ctx, Wrap } of [...fx.wraps].reverse()) {
    layer = (
      <Wrap key={key} ctx={ctx}>
        {layer}
      </Wrap>
    );
  }

  return (
    <div
      ref={ref}
      className={`@container relative aspect-square w-full touch-none select-none rounded-[6%] bg-ink-800 ring-1 ring-white/10 [-webkit-touch-callout:none] ${disabled ? "opacity-60" : ""}`}
      style={{ padding: `${PAD * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onLostPointerCapture={(e) => finish(e, true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !gesture.current && moveLight(null)}
      onContextMenu={(e) => e.preventDefault()}
      role="grid"
      aria-label="Letter board. Drag across adjacent letters, or tap them one by one."
    >
      {layer}
      {fx.overlays.map(({ key, ctx, Overlay }) => (
        <Overlay key={key} ctx={ctx} />
      ))}
      {fx.calmed.length > 0 && <CalmOverlay effects={fx.calmed} />}
    </div>
  );
}

/** Static stand-in for spinning/wobbling/shuffling effects when motion is reduced. */
function CalmOverlay({ effects }: { effects: ActiveEffect[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-start gap-1 rounded-[6%] bg-[#CC79A7]/15 p-2 ring-4 ring-inset ring-[#CC79A7]/60" aria-hidden>
      {effects.map((e) => {
        const card = getCard(e.cardId);
        return (
          <span key={e.id} className="rounded-full bg-ink-950/85 px-3 py-1 text-sm font-black">
            {card?.emoji} {card?.name}
          </span>
        );
      })}
    </div>
  );
}

const BLOBS = [
  "M50 8c12 0 14 14 26 14s18 12 14 24 6 18-4 28-20 6-30 16-24-2-30-12-22-6-18-20-8-22 4-30S38 8 50 8z",
  "M46 6c16-4 18 12 30 16s16 18 8 30 4 24-10 30-18-4-30 6-24-4-26-18-16-14-10-28S30 10 46 6z",
];

function InkBlob({ seed, wiping }: { seed: number; wiping: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-[-6%] h-[112%] w-[112%] transition-[transform,opacity] ease-linear"
      style={{
        transform: `rotate(${seed * 47}deg) scale(${wiping ? 0.25 : 1})`,
        opacity: wiping ? 0.35 : 1,
        transitionDuration: wiping ? `${CARD_RULES.inkWipeHoldMs}ms` : "150ms",
      }}
      aria-hidden
    >
      <path d={BLOBS[seed % BLOBS.length]} fill="#1b1033" />
      <circle cx="84" cy="16" r="6" fill="#1b1033" />
      <circle cx="12" cy="82" r="4" fill="#1b1033" />
    </svg>
  );
}
