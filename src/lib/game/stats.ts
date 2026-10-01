import { scoreWord } from "./scoring";
import type { PlayerFinalStats, RoundResult } from "./types";

interface StatsPlayer {
  id: string;
  nickname: string;
  score: number;
}

/** Leaderboard order: score, then unique words, then nickname. Equal score + uniques share a rank. */
export function finalStats(players: StatsPlayer[], history: RoundResult[]): PlayerFinalStats[] {
  const rows = players.map((p) => {
    let wordsFound = 0;
    let uniqueWords = 0;
    let longestWord: string | null = null;
    let bestWord: PlayerFinalStats["bestWord"] = null;
    for (const round of history) {
      const r = round.players[p.id];
      if (!r) continue;
      wordsFound += r.words.length;
      uniqueWords += r.uniqueWords.length;
      for (const w of r.words) {
        if (!longestWord || w.length > longestWord.length) longestWord = w;
      }
      for (const w of r.uniqueWords) {
        const points = scoreWord(w);
        if (!bestWord || points > bestWord.points || (points === bestWord.points && w.length > bestWord.word.length)) {
          bestWord = { word: w, points };
        }
      }
    }
    return { playerId: p.id, nickname: p.nickname, rank: 0, score: p.score, wordsFound, uniqueWords, longestWord, bestWord };
  });

  rows.sort((a, b) => b.score - a.score || b.uniqueWords - a.uniqueWords || a.nickname.localeCompare(b.nickname));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.score === row.score && prev.uniqueWords === row.uniqueWords ? prev.rank : i + 1;
  });
  return rows.map((r) => ({
    playerId: r.playerId,
    rank: r.rank,
    score: r.score,
    wordsFound: r.wordsFound,
    uniqueWords: r.uniqueWords,
    longestWord: r.longestWord,
    bestWord: r.bestWord,
  }));
}
