import { describe, expect, it } from "vitest";
import { generateBoard } from "@/lib/game/generator";
import { mulberry32 } from "@/lib/game/rng";
import { getDictionary, parseWordList } from "../dictionary";

describe("parseWordList", () => {
  it("keeps only spellable words", () => {
    expect(parseWordList("AA\ncat\r\nQAT\nquit\nfoo-bar\n  Dog  \nabcdefghijklmnopqr\n")).toEqual(["cat", "quit", "dog"]);
  });
});

describe("ENABLE dictionary", () => {
  it("loads into a trie once", async () => {
    const trie = await getDictionary();
    expect(trie.size).toBeGreaterThan(150_000);
    expect(trie.has("quiz")).toBe(true);
    expect(trie.has("qat")).toBe(false);
    expect(trie.has("zzzx")).toBe(false);
    expect(await getDictionary()).toBe(trie);
  });

  it("generates boards that meet the default word target", async () => {
    const trie = await getDictionary();
    const rng = mulberry32(7);
    for (let i = 0; i < 20; i++) {
      const { solution, board } = generateBoard(trie, { minWords: 40, rng });
      expect(solution.length).toBeGreaterThanOrEqual(40);
      expect(board.tiles).toHaveLength(16);
    }
  });
});
