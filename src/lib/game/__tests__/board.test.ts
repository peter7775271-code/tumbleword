import { describe, expect, it } from "vitest";
import {
  CLASSIC_DICE,
  boardFromRows,
  faceToTile,
  isAdjacent,
  neighbours,
  rollBoard,
  tileLabel,
  validatePath,
  wordFromPath,
} from "../board";
import { mulberry32 } from "../rng";

/** True if each tile can be assigned to a distinct die showing that face (bipartite matching). */
function tilesMatchDice(tiles: string[], dice: readonly string[]): boolean {
  const owner = new Array<number>(dice.length).fill(-1);
  const faces = dice.map((d) => new Set(d.split("").map(faceToTile)));
  const tryAssign = (t: number, seen: boolean[]): boolean => {
    for (let d = 0; d < dice.length; d++) {
      if (seen[d] || !faces[d].has(tiles[t])) continue;
      seen[d] = true;
      if (owner[d] === -1 || tryAssign(owner[d], seen)) {
        owner[d] = t;
        return true;
      }
    }
    return false;
  };
  return tiles.every((_, t) => tryAssign(t, new Array(dice.length).fill(false)));
}

describe("dice", () => {
  it("has 16 six-sided dice", () => {
    expect(CLASSIC_DICE).toHaveLength(16);
    for (const die of CLASSIC_DICE) expect(die).toMatch(/^[A-Z]{6}$/);
  });

  it("turns Q into a single Qu tile", () => {
    expect(faceToTile("Q")).toBe("qu");
    expect(faceToTile("A")).toBe("a");
    expect(tileLabel("qu")).toBe("Qu");
  });
});

describe("rollBoard", () => {
  it("uses each die exactly once", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = rollBoard(mulberry32(seed));
      expect(board.size).toBe(4);
      expect(board.tiles).toHaveLength(16);
      expect(tilesMatchDice(board.tiles, CLASSIC_DICE)).toBe(true);
    }
  });

  it("never produces a bare q", () => {
    let sawQu = false;
    for (let seed = 1; seed <= 500; seed++) {
      const { tiles } = rollBoard(mulberry32(seed));
      expect(tiles).not.toContain("q");
      if (tiles.includes("qu")) sawQu = true;
    }
    expect(sawQu).toBe(true);
  });

  it("is deterministic for a seed", () => {
    expect(rollBoard(mulberry32(42))).toEqual(rollBoard(mulberry32(42)));
    expect(rollBoard(mulberry32(42))).not.toEqual(rollBoard(mulberry32(43)));
  });
});

describe("adjacency", () => {
  it("connects all 8 directions", () => {
    // index 5 is (1,1) on a 4x4 board
    expect(neighbours(4)[5].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
  });

  it("gives corners 3 neighbours and edges 5", () => {
    expect(neighbours(4)[0]).toHaveLength(3);
    expect(neighbours(4)[15]).toHaveLength(3);
    expect(neighbours(4)[1]).toHaveLength(5);
  });

  it("does not wrap around row ends", () => {
    expect(isAdjacent(4, 3, 4)).toBe(false);
    expect(isAdjacent(4, 7, 8)).toBe(false);
    expect(isAdjacent(4, 3, 7)).toBe(true);
  });

  it("is not adjacent to itself", () => {
    expect(isAdjacent(4, 6, 6)).toBe(false);
  });
});

describe("validatePath", () => {
  const board = boardFromRows(["ABCD", "EFGH", "IJKL", "MNOQ"]);

  it("accepts a legal path", () => {
    expect(validatePath(board, [0, 5, 10, 15])).toBeNull();
    expect(wordFromPath(board, [0, 5, 10, 15])).toBe("afkqu");
  });

  it("rejects tile reuse", () => {
    expect(validatePath(board, [0, 1, 0])).toBe("reused_tile");
  });

  it("rejects non-adjacent steps, including row wrap", () => {
    expect(validatePath(board, [0, 2])).toBe("not_adjacent");
    expect(validatePath(board, [3, 4])).toBe("not_adjacent");
  });

  it("rejects out of bounds and empty paths", () => {
    expect(validatePath(board, [0, 16])).toBe("out_of_bounds");
    expect(validatePath(board, [-1])).toBe("out_of_bounds");
    expect(validatePath(board, [1.5])).toBe("out_of_bounds");
    expect(validatePath(board, [])).toBe("empty");
  });
});
