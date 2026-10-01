import { describe, expect, it } from "vitest";
import { boardFromRows } from "../board";
import { scoreRound, scoreWord } from "../scoring";
import { finalStats } from "../stats";
import type { Submission } from "../types";

const board = boardFromRows(["ABCD", "EFGH", "IJKL", "MNOP"]);
const sub = (playerId: string, word: string, round = 1): Submission => ({ round, playerId, word, submittedAt: 0 });

describe("scoreWord", () => {
  it.each([
    ["at", 0],
    ["cat", 1],
    ["cats", 1],
    ["quit", 1], // Qu counts as two letters
    ["quite", 2],
    ["planet", 3],
    ["planets", 5],
    ["elephant", 11],
    ["quizzically", 11],
  ])("%s scores %i", (word, points) => {
    expect(scoreWord(word)).toBe(points);
  });
});

describe("scoreRound", () => {
  const solution = ["planets", "planet", "plane", "plan", "lane", "ant"];

  it("cancels words found by two or more players", () => {
    const r = scoreRound({
      round: 1, board, solution,
      playerIds: ["a", "b", "c"],
      submissions: [sub("a", "plane"), sub("b", "plane"), sub("c", "plane"), sub("a", "lane")],
    });
    const plane = r.words.find((w) => w.word === "plane")!;
    expect(plane.cancelled).toBe(true);
    expect(plane.points).toBe(0);
    expect(plane.playerIds).toEqual(["a", "b", "c"]);
    expect(r.players.a.cancelledWords).toEqual(["plane"]);
    expect(r.players.a.uniqueWords).toEqual(["lane"]);
    expect(r.players.a.wordPoints).toBe(1);
    expect(r.players.b.wordPoints).toBe(0);
  });

  it("does not treat one player's repeated submission as a duplicate", () => {
    const r = scoreRound({
      round: 1, board, solution, playerIds: ["a"],
      submissions: [sub("a", "plan"), sub("a", "plan")],
    });
    expect(r.words).toHaveLength(1);
    expect(r.words[0].cancelled).toBe(false);
    expect(r.players.a.words).toEqual(["plan"]);
  });

  it("awards the longest-word bonus to the longest unique word only", () => {
    const r = scoreRound({
      round: 1, board, solution, playerIds: ["a", "b"],
      submissions: [sub("a", "planets"), sub("b", "planets"), sub("a", "planet"), sub("b", "plan")],
    });
    expect(r.longestBonus).toEqual({ length: 6, playerIds: ["a"], words: ["planet"] });
    expect(r.players.a.bonus).toBe(3);
    expect(r.players.a.total).toBe(3 + 3);
    expect(r.players.b.total).toBe(1);
  });

  it("gives every tied player the bonus", () => {
    const r = scoreRound({
      round: 1, board, solution: [], playerIds: ["a", "b", "c"],
      submissions: [sub("a", "plane"), sub("b", "blank"), sub("c", "cat")],
    });
    expect(r.longestBonus?.playerIds).toEqual(["a", "b"]);
    expect(r.players.a.total).toBe(5);
    expect(r.players.b.total).toBe(5);
    expect(r.players.c.total).toBe(1);
  });

  it("gives no bonus when every word was cancelled", () => {
    const r = scoreRound({
      round: 1, board, solution, playerIds: ["a", "b"],
      submissions: [sub("a", "plan"), sub("b", "plan")],
    });
    expect(r.longestBonus).toBeNull();
    expect(r.players.a.total).toBe(0);
  });

  it("ignores submissions from other rounds and removed players", () => {
    const r = scoreRound({
      round: 2, board, solution, playerIds: ["a"],
      submissions: [sub("a", "plan", 1), sub("kicked", "lane", 2), sub("a", "lane", 2)],
    });
    expect(r.words.map((w) => w.word)).toEqual(["lane"]);
    expect(r.words[0].cancelled).toBe(false);
    expect(r.players.kicked).toBeUndefined();
  });

  it("lists the words nobody found, longest first", () => {
    const r = scoreRound({
      round: 1, board, solution, playerIds: ["a"],
      submissions: [sub("a", "planets"), sub("a", "lane")],
    });
    expect(r.missed).toEqual(["planet", "plane", "plan", "ant"]);
    expect(r.totalPossible).toBe(6);
  });

  it("includes players who found nothing", () => {
    const r = scoreRound({ round: 1, board, solution, playerIds: ["a"], submissions: [] });
    expect(r.players.a).toMatchObject({ words: [], total: 0 });
  });
});

describe("finalStats", () => {
  it("ranks players and reports per-player stats", () => {
    const r1 = scoreRound({
      round: 1, board, solution: [], playerIds: ["a", "b", "c"],
      submissions: [sub("a", "planets"), sub("b", "planets"), sub("a", "cat"), sub("b", "plane"), sub("c", "dog")],
    });
    const players = [
      { id: "a", nickname: "Ann", score: r1.players.a.total },
      { id: "b", nickname: "Bob", score: r1.players.b.total },
      { id: "c", nickname: "Cy", score: r1.players.c.total },
    ];
    const stats = finalStats(players, [r1]);
    expect(stats.map((s) => s.playerId)).toEqual(["b", "a", "c"]);
    const b = stats[0];
    expect(b).toMatchObject({ rank: 1, score: 5, wordsFound: 2, uniqueWords: 1, longestWord: "planets" });
    expect(b.bestWord).toEqual({ word: "plane", points: 2 });
    // a and c both have 1 point and 1 unique word: shared rank
    expect(stats[1].rank).toBe(2);
    expect(stats[2].rank).toBe(2);
  });
});
