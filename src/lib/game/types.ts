/** A single face shown on the board: one lowercase letter, or "qu". */
export type Tile = string;

export interface Board {
  size: number;
  /** Row-major list of size * size tiles. */
  tiles: Tile[];
}

export type Phase = "LOBBY" | "COUNTDOWN" | "ROUND" | "REVEAL" | "FINAL";

export interface Settings {
  rounds: number;
  roundSeconds: number;
  /** Boards with fewer valid words than this are re-rolled. */
  minWords: number;
  hints: boolean;
}

export type PlayerStatus = "active" | "spectating";

export interface Player {
  id: string;
  nickname: string;
  color: string;
  emoji: string;
  joinedAt: number;
  lastSeenAt: number;
  /** Late joiners spectate until the next round starts. */
  status: PlayerStatus;
  score: number;
}

/** Server-side player record. The token never leaves the server except to its owner. */
export interface ServerPlayer extends Player {
  token: string;
}

export interface Submission {
  round: number;
  playerId: string;
  word: string;
  submittedAt: number;
}

export interface WordResult {
  word: string;
  playerIds: string[];
  /** Points awarded to each finder (0 when cancelled). */
  points: number;
  cancelled: boolean;
}

export interface PlayerRoundResult {
  playerId: string;
  /** Every valid word the player found this round. */
  words: string[];
  uniqueWords: string[];
  cancelledWords: string[];
  wordPoints: number;
  bonus: number;
  total: number;
}

export interface LongestBonus {
  length: number;
  playerIds: string[];
  words: string[];
}

export interface RoundResult {
  round: number;
  board: Board;
  words: WordResult[];
  players: Record<string, PlayerRoundResult>;
  longestBonus: LongestBonus | null;
  /** Longest words on the board that nobody found. */
  missed: string[];
  totalPossible: number;
}

export interface Round {
  number: number;
  board: Board;
  /** Every word on the board, longest first. Server-only until the reveal. */
  solution: string[];
  startsAt: number;
  endsAt: number;
  hintsUsed: Record<string, number>;
}

export interface Room {
  code: string;
  phase: Phase;
  settings: Settings;
  players: ServerPlayer[];
  kickedIds: string[];
  hostToken: string;
  hostLastSeenAt: number;
  round: Round | null;
  history: RoundResult[];
  createdAt: number;
}

export interface PlayerFinalStats {
  playerId: string;
  rank: number;
  score: number;
  wordsFound: number;
  uniqueWords: number;
  longestWord: string | null;
  bestWord: { word: string; points: number } | null;
}
