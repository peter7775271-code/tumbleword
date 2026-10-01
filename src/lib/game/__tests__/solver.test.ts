import { describe, expect, it } from "vitest";
import { boardFromRows } from "../board";
import { generateBoard } from "../generator";
import { mulberry32 } from "../rng";
import { findPath, pathSpells, solve, sortWords } from "../solver";
import { Trie } from "../trie";

describe("Trie", () => {
  const trie = Trie.fromWords(["cat", "cats", "car", "dog"]);

  it("stores and finds words", () => {
    expect(trie.size).toBe(4);
    expect(trie.has("cat")).toBe(true);
    expect(trie.has("cats")).toBe(true);
    expect(trie.has("ca")).toBe(false);
    expect(trie.has("cow")).toBe(false);
  });

  it("supports prefix walking", () => {
    const ca = trie.walk(trie.root, "ca");
    expect(ca).not.toBe(-1);
    expect(trie.isWord(ca)).toBe(false);
    expect(trie.hasChildren(ca)).toBe(true);
    expect(trie.walk(trie.root, "x")).toBe(-1);
  });

  it("ignores duplicate inserts in its count", () => {
    expect(Trie.fromWords(["a", "a"]).size).toBe(1);
  });
});

describe("solve", () => {
  const dict = Trie.fromWords([
    "cat", "act", "tax", "quit", "quite", "qat", "uqat", "at", "ax", "dxz", "tide", "edit",
  ]);
  // 0 C  1 A  2 T  3 D
  // 4 X  5 Qu 6 I  7 Z
  // 8 Z  9 Z 10 T 11 Z
  // 12 E 13 B 14 Z 15 Z
  const board = boardFromRows(["CATD", "XQIZ", "ZZTZ", "EBZZ"]);
  const words = solve(board, dict);

  it("finds words in all directions, including diagonals", () => {
    expect(words.has("cat")).toBe(true);
    expect(words.has("tax")).toBe(true); // a(1) -> x(4) is diagonal
  });

  it("treats Qu as one tile", () => {
    expect(words.has("quit")).toBe(true);
    expect(words.get("quit")).toEqual([5, 6, 2]);
    expect(words.has("quite")).toBe(false); // e(12) is not next to either T
    expect(words.has("qat")).toBe(false); // a lone Q never appears
    expect(words.has("uqat")).toBe(false);
  });

  it("respects adjacency and does not wrap rows", () => {
    expect(words.has("act")).toBe(false); // c(0) and t(2) are two columns apart
    // d(3) and x(4) are consecutive in row-major order but not adjacent.
    expect(words.has("dxz")).toBe(false);
    expect(words.has("tide")).toBe(false);
    expect(words.has("edit")).toBe(false);
  });

  it("skips words shorter than the minimum", () => {
    expect(words.has("at")).toBe(false);
    expect(solve(board, dict, 2).has("at")).toBe(true);
  });

  it("returns valid paths for every word", () => {
    for (const [word, path] of words) expect(pathSpells(board, path, word)).toBe(true);
  });
});

describe("solve tile reuse", () => {
  const dict = Trie.fromWords(["aba", "abab", "baz", "zab"]);
  const words = solve(boardFromRows(["ABZZ", "ZZZZ", "ZZZZ", "ZZZZ"]), dict);

  it("never reuses a tile within a word", () => {
    expect(words.has("baz")).toBe(true);
    expect(words.has("zab")).toBe(true);
    expect(words.has("aba")).toBe(false);
    expect(words.has("abab")).toBe(false);
  });
});

describe("findPath", () => {
  // tiles: qu i t u
  const board = boardFromRows(["QITU", "ZZZZ", "ZZZZ", "ZZZZ"]);

  it("finds a path through a Qu tile", () => {
    expect(findPath(board, "quit")).toEqual([0, 1, 2]);
    expect(findPath(board, "uti")).toEqual([3, 2, 1]);
  });

  it("returns null when the word cannot be traced", () => {
    expect(findPath(board, "qit")).toBeNull(); // Q only exists as Qu
    expect(findPath(board, "quu")).toBeNull(); // u(3) is not next to Qu
    expect(findPath(board, "titi")).toBeNull(); // would reuse tiles
  });
});

describe("pathSpells", () => {
  const board = boardFromRows(["CATS", "ZZZZ", "ZZZZ", "ZZZZ"]);

  it("checks the word matches the path", () => {
    expect(pathSpells(board, [0, 1, 2], "cat")).toBe(true);
    expect(pathSpells(board, [0, 1, 2], "cats")).toBe(false);
    expect(pathSpells(board, [0, 1, 0], "cac")).toBe(false);
  });
});

describe("sortWords", () => {
  it("orders longest first then alphabetically", () => {
    expect(sortWords(["bat", "apple", "ant", "zebra"])).toEqual(["apple", "zebra", "ant", "bat"]);
  });
});

describe("generateBoard", () => {
  const dict = Trie.fromWords(["tea", "eat", "ate", "tee", "set", "see", "sea", "net", "ten", "tan"]);

  it("returns the richest board when the target is unreachable", () => {
    const result = generateBoard(dict, { minWords: 10_000, rng: mulberry32(1), maxAttempts: 20 });
    expect(result.attempts).toBe(20);
    expect(result.board.tiles).toHaveLength(16);
  });

  it("stops at the first board meeting the target", () => {
    const result = generateBoard(dict, { minWords: 0, rng: mulberry32(1) });
    expect(result.attempts).toBe(1);
  });
});
