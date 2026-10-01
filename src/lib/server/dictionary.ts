import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BOARD_SIZE, MIN_WORD_LENGTH } from "@/lib/game/constants";
import { Trie } from "@/lib/game/trie";

/** The longest word a 4x4 board can spell: every tile used, one of them Qu. */
const MAX_WORD_LENGTH = BOARD_SIZE * BOARD_SIZE + 1;

export const DICTIONARY_PATH = path.join(process.cwd(), "data", "enable1.txt");

/** Parses a one-word-per-line list, keeping only words a board could ever spell. */
export function parseWordList(text: string): string[] {
  const words: string[] = [];
  for (const line of text.split("\n")) {
    const w = line.trim().toLowerCase();
    if (w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH || !/^[a-z]+$/.test(w)) continue;
    // Q only exists as the Qu tile, so a q not followed by u can never be spelled.
    if (/q(?!u)/.test(w)) continue;
    words.push(w);
  }
  return words;
}

const cache = globalThis as unknown as { __tumblewordTrie?: Promise<Trie> };

/** Loads the word list once per server instance and keeps the trie in memory. */
export function getDictionary(): Promise<Trie> {
  cache.__tumblewordTrie ??= readFile(DICTIONARY_PATH, "utf8")
    .then((text) => Trie.fromWords(parseWordList(text)))
    .catch((err) => {
      cache.__tumblewordTrie = undefined;
      throw err;
    });
  return cache.__tumblewordTrie;
}
