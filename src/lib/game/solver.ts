import { neighbours, validatePath, wordFromPath } from "./board";
import { MIN_WORD_LENGTH } from "./constants";
import type { Trie } from "./trie";
import type { Board } from "./types";

/** Finds every dictionary word on the board. Maps word -> one tile path that spells it. */
export function solve(board: Board, trie: Trie, minLength = MIN_WORD_LENGTH): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const adj = neighbours(board.size);
  const visited = new Array<boolean>(board.tiles.length).fill(false);
  const path: number[] = [];

  const dfs = (tile: number, parent: number, prefix: string) => {
    const node = trie.walk(parent, board.tiles[tile]);
    if (node === -1) return;
    const word = prefix + board.tiles[tile];
    visited[tile] = true;
    path.push(tile);
    if (word.length >= minLength && trie.isWord(node) && !found.has(word)) {
      found.set(word, path.slice());
    }
    if (trie.hasChildren(node)) {
      for (const next of adj[tile]) if (!visited[next]) dfs(next, node, word);
    }
    path.pop();
    visited[tile] = false;
  };

  for (let i = 0; i < board.tiles.length; i++) dfs(i, trie.root, "");
  return found;
}

/** Sorts words longest first, then alphabetically. */
export function sortWords(words: Iterable<string>): string[] {
  return [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** Finds any valid tile path spelling `word` on the board (dictionary not consulted). */
export function findPath(board: Board, word: string): number[] | null {
  const adj = neighbours(board.size);
  const visited = new Array<boolean>(board.tiles.length).fill(false);
  const path: number[] = [];

  const dfs = (tile: number, offset: number): boolean => {
    const face = board.tiles[tile];
    if (!word.startsWith(face, offset)) return false;
    const end = offset + face.length;
    visited[tile] = true;
    path.push(tile);
    if (end === word.length) return true;
    for (const next of adj[tile]) if (!visited[next] && dfs(next, end)) return true;
    path.pop();
    visited[tile] = false;
    return false;
  };

  for (let i = 0; i < board.tiles.length; i++) if (dfs(i, 0)) return path;
  return null;
}

/** True when `path` is a legal path on the board and spells exactly `word`. */
export function pathSpells(board: Board, path: readonly number[], word: string): boolean {
  return validatePath(board, path) === null && wordFromPath(board, path) === word;
}
