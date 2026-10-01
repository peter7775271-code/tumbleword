"use client";

import { useLayoutEffect, useRef, type PointerEvent } from "react";
import { isAdjacent, tileLabel } from "@/lib/game/board";
import type { Board } from "@/lib/game/types";
import { vibrate } from "@/lib/client/haptics";
import { play } from "@/lib/client/sound";

/** Board padding as a fraction of its width; tile centers and hit-testing both derive from it. */
const PAD = 0.04;
/** While dragging, a tile only registers inside this radius (in cell units) so diagonals don't clip neighbours. */
const DRAG_HIT_RADIUS = 0.36;

interface Props {
  board: Board;
  path: number[];
  onPathChange: (path: number[]) => void;
  /** Called when a drag gesture ends (not for taps). */
  onDragEnd: (path: number[]) => void;
  disabled?: boolean;
  hintTile?: number | null;
  effects?: string[];
}

export function SwipeBoard({ board, path, onPathChange, onDragEnd, disabled = false, hintTile = null, effects = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef(path);
  useLayoutEffect(() => {
    pathRef.current = path;
  }, [path]);
  const gesture = useRef<{ moved: boolean; tappedLast: boolean } | null>(null);
  const size = board.size;

  const setPath = (next: number[]) => {
    if (next.length > pathRef.current.length) {
      vibrate("tap");
      play("tap");
    }
    pathRef.current = next;
    onPathChange(next);
  };

  const tileAt = (clientX: number, clientY: number, strict: boolean): number | null => {
    const rect = ref.current!.getBoundingClientRect();
    const cell = (rect.width * (1 - 2 * PAD)) / size;
    const x = (clientX - rect.left - rect.width * PAD) / cell;
    const y = (clientY - rect.top - rect.width * PAD) / cell;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (strict && Math.hypot(x - col - 0.5, y - row - 0.5) > DRAG_HIT_RADIUS) return null;
    return row * size + col;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const t = tileAt(e.clientX, e.clientY, false);
    if (t === null) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released; the gesture still works without capture
    }
    const current = pathRef.current;
    const last = current.at(-1);
    let tappedLast = false;
    if (t === last) tappedLast = true;
    else if (last !== undefined && !current.includes(t) && isAdjacent(size, last, t)) setPath([...current, t]);
    else if (current.includes(t)) setPath(current.slice(0, current.indexOf(t) + 1));
    else setPath([t]);
    gesture.current = { moved: false, tappedLast };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || disabled) return;
    const t = tileAt(e.clientX, e.clientY, true);
    const current = pathRef.current;
    const last = current.at(-1);
    if (t === null || t === last || last === undefined) return;
    if (current.length >= 2 && t === current[current.length - 2]) setPath(current.slice(0, -1));
    else if (!current.includes(t) && isAdjacent(size, last, t)) setPath([...current, t]);
    else return;
    g.moved = true;
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.moved) onDragEnd(pathRef.current);
    else if (g.tappedLast) setPath(pathRef.current.slice(0, -1));
  };

  const center = (i: number) => {
    const cell = (100 * (1 - 2 * PAD)) / size;
    return [100 * PAD + ((i % size) + 0.5) * cell, 100 * PAD + (Math.floor(i / size) + 0.5) * cell];
  };

  const effectSet = new Set(effects);
  const boardStyle = {
    transform: effectSet.has("spin") ? "rotate(6deg)" : effectSet.has("mirror") ? "scaleX(-1)" : undefined,
    filter: [
      effectSet.has("blur") ? "blur(2px)" : "",
      effectSet.has("dark") ? "brightness(0.62) saturate(0.7)" : "",
      effectSet.has("tiny") ? "scale(0.92)" : "",
      effectSet.has("vortex") ? "contrast(1.2) saturate(1.4)" : "",
    ].filter(Boolean).join(" ") || undefined,
    animation: effectSet.has("wiggle") ? "wiggle 0.7s ease-in-out infinite" : undefined,
    opacity: effectSet.has("vortex") ? 0.9 : undefined,
  };

  return (
    <div
      ref={ref}
      className={`@container relative aspect-square w-full touch-none select-none rounded-[6%] bg-ink-800 ring-1 ring-white/10 ${disabled ? "opacity-60" : ""}`}
      style={{ padding: `${PAD * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="grid"
      aria-label="Letter board. Drag across adjacent letters, or tap them one by one."
    >
      <div className="grid h-full w-full" style={{ ...boardStyle, gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {board.tiles.map((tile, i) => {
          const selected = path.includes(i);
          const isLast = path.at(-1) === i;
          const locked = effectSet.has("lock") && i % 2 === 0;
          return (
            <div key={i} className="p-[8%]" role="gridcell" aria-selected={selected}>
              <div
                className={`grid h-full w-full place-items-center rounded-[18%] font-black transition-all duration-100 ${
                  selected
                    ? "scale-95 bg-amber text-ink-950 shadow-[0_0.5cqw_0_#b37b00]"
                    : "bg-cream text-tile-ink shadow-[0_1cqw_0_var(--color-tile-edge)]"
                } ${isLast ? "ring-4 ring-white" : ""} ${hintTile === i && !selected ? "animate-pulse-soft ring-[1.2cqw] ring-sky" : ""} ${locked ? "opacity-55" : ""}`}
                style={locked ? { boxShadow: "inset 0 0 0 2px rgba(255,176,0,0.7)" } : undefined}
              >
                <span className={tile === "qu" ? "text-[9cqw]" : "text-[12cqw]"}>{tileLabel(tile)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {path.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <polyline
            points={path.map((i) => center(i).join(",")).join(" ")}
            fill="none"
            stroke="white"
            strokeOpacity={0.75}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
