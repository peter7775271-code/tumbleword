import { BOARD_SIZE } from "./constants";
import { randomInt, shuffle, type Rng } from "./rng";
import type { Board, Tile } from "./types";

/** The classic 16-die set. "Q" faces are rolled as the single tile "qu". */
export const CLASSIC_DICE: readonly string[] = [
  "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS",
  "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
  "DISTTY", "EEGHNW", "EEINSU", "EHRTVW",
  "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ",
];

export function faceToTile(face: string): Tile {
  const lower = face.toLowerCase();
  return lower === "q" ? "qu" : lower;
}

export function rollBoard(rng: Rng, dice: readonly string[] = CLASSIC_DICE): Board {
  const size = Math.sqrt(dice.length);
  if (!Number.isInteger(size)) throw new Error("Dice count must be a perfect square");
  const tiles = shuffle(dice, rng).map((die) => faceToTile(die[randomInt(rng, die.length)]));
  return { size, tiles };
}

/** Builds a board from rows like ["ABCD", ...]. "Q" becomes "qu". */
export function boardFromRows(rows: string[]): Board {
  const size = rows.length;
  const tiles = rows.flatMap((row) => {
    if (row.length !== size) throw new Error("Board must be square");
    return row.split("").map(faceToTile);
  });
  return { size, tiles };
}

export function isAdjacent(size: number, a: number, b: number): boolean {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return dr <= 1 && dc <= 1;
}

const neighbourCache = new Map<number, number[][]>();

export function neighbours(size: number = BOARD_SIZE): number[][] {
  const cached = neighbourCache.get(size);
  if (cached) return cached;
  const result: number[][] = [];
  for (let i = 0; i < size * size; i++) {
    const list: number[] = [];
    for (let j = 0; j < size * size; j++) if (isAdjacent(size, i, j)) list.push(j);
    result.push(list);
  }
  neighbourCache.set(size, result);
  return result;
}

export function tileLabel(tile: Tile): string {
  return tile === "qu" ? "Qu" : tile.toUpperCase();
}

export function wordFromPath(board: Board, path: readonly number[]): string {
  return path.map((i) => board.tiles[i]).join("");
}

export type PathError = "empty" | "out_of_bounds" | "reused_tile" | "not_adjacent";

/** Checks that a path stays on the board, only steps to neighbours, and never reuses a tile. */
export function validatePath(board: Board, path: readonly number[]): PathError | null {
  if (path.length === 0) return "empty";
  const seen = new Set<number>();
  const total = board.size * board.size;
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    if (!Number.isInteger(i) || i < 0 || i >= total) return "out_of_bounds";
    if (seen.has(i)) return "reused_tile";
    if (k > 0 && !isAdjacent(board.size, path[k - 1], i)) return "not_adjacent";
    seen.add(i);
  }
  return null;
}
