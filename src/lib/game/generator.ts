import { rollBoard } from "./board";
import { sortWords, solve } from "./solver";
import type { Rng } from "./rng";
import type { Trie } from "./trie";
import type { Board } from "./types";

export interface GeneratedBoard {
  board: Board;
  /** Every word on the board, longest first. */
  solution: string[];
  attempts: number;
}

export interface GenerateOptions {
  minWords: number;
  rng?: Rng;
  maxAttempts?: number;
}

/**
 * Rolls boards until one has at least `minWords` words. If none qualifies within
 * `maxAttempts`, returns the richest board seen so the game never stalls.
 */
export function generateBoard(trie: Trie, { minWords, rng = Math.random, maxAttempts = 500 }: GenerateOptions): GeneratedBoard {
  let best: GeneratedBoard | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const board = rollBoard(rng);
    const solution = sortWords(solve(board, trie).keys());
    if (!best || solution.length > best.solution.length) best = { board, solution, attempts: attempt };
    if (solution.length >= minWords) return { board, solution, attempts: attempt };
  }
  return { ...best!, attempts: maxAttempts };
}
