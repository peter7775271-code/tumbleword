import { tileLabel } from "@/lib/game/board";
import type { Board } from "@/lib/game/types";

/** Read-only board (host screen, reveals). Letters scale with the board via container units. */
export function BoardView({ board, hidden = false, className = "" }: { board: Board; hidden?: boolean; className?: string }) {
  return (
    <div
      className={`@container grid aspect-square gap-[3%] rounded-[6%] bg-ink-800 p-[4%] shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))` }}
      role="img"
      aria-label={hidden ? "Board hidden" : `Board: ${board.tiles.map(tileLabel).join(" ")}`}
    >
      {board.tiles.map((tile, i) => (
        <div
          key={i}
          className="grid aspect-square place-items-center rounded-[18%] bg-cream font-black text-tile-ink shadow-[0_0.6cqw_0_var(--color-tile-edge)] transition-transform duration-500"
          style={{ transform: hidden ? "rotateY(90deg)" : undefined, transitionDelay: `${i * 25}ms` }}
        >
          <span className={tile === "qu" ? "text-[9cqw]" : "text-[12cqw]"}>{hidden ? "" : tileLabel(tile)}</span>
        </div>
      ))}
    </div>
  );
}
