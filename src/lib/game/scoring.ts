import { LONGEST_WORD_BONUS, MIN_WORD_LENGTH, MISSED_WORDS_SHOWN } from "./constants";
import type { Board, LongestBonus, PlayerRoundResult, RoundResult, Submission, WordResult } from "./types";

/** Points by letter count ("qu" counts as two letters). */
export function scoreWord(word: string): number {
  const n = word.length;
  if (n < MIN_WORD_LENGTH) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}

export interface ScoreRoundInput {
  round: number;
  board: Board;
  solution: string[];
  submissions: Submission[];
  /** Only these players are scored (kicked players' words are ignored). */
  playerIds: string[];
}

/**
 * Applies the party rules:
 * - words found by 2+ players are cancelled for everyone (0 points);
 * - unique words score by length;
 * - the longest unique word(s) earn a bonus for each finder (ties all get it).
 */
export function scoreRound({ round, board, solution, submissions, playerIds }: ScoreRoundInput): RoundResult {
  const allowed = new Set(playerIds);
  const finders = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (s.round !== round || !allowed.has(s.playerId)) continue;
    let set = finders.get(s.word);
    if (!set) finders.set(s.word, (set = new Set()));
    set.add(s.playerId);
  }

  const words: WordResult[] = [...finders.entries()]
    .map(([word, ids]) => {
      const cancelled = ids.size > 1;
      return { word, playerIds: [...ids].sort(), cancelled, points: cancelled ? 0 : scoreWord(word) };
    })
    .sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));

  const players: Record<string, PlayerRoundResult> = {};
  for (const id of playerIds) {
    players[id] = { playerId: id, words: [], uniqueWords: [], cancelledWords: [], wordPoints: 0, bonus: 0, cardPoints: 0, total: 0 };
  }
  for (const w of words) {
    for (const id of w.playerIds) {
      const p = players[id];
      p.words.push(w.word);
      if (w.cancelled) p.cancelledWords.push(w.word);
      else {
        p.uniqueWords.push(w.word);
        p.wordPoints += w.points;
      }
    }
  }

  let longestBonus: LongestBonus | null = null;
  const uniques = words.filter((w) => !w.cancelled);
  if (uniques.length > 0) {
    const length = Math.max(...uniques.map((w) => w.word.length));
    const top = uniques.filter((w) => w.word.length === length);
    const ids = [...new Set(top.flatMap((w) => w.playerIds))].sort();
    longestBonus = { length, playerIds: ids, words: top.map((w) => w.word) };
    for (const id of ids) players[id].bonus = LONGEST_WORD_BONUS;
  }
  for (const p of Object.values(players)) p.total = p.wordPoints + p.bonus + p.cardPoints;

  return {
    round,
    board,
    words,
    players,
    longestBonus,
    missed: solution.filter((w) => !finders.has(w)).slice(0, MISSED_WORDS_SHOWN),
    totalPossible: solution.length,
  };
}
