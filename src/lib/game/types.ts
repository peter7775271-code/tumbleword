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
  sabotageEnabled: boolean;
  /** Shortest valid word that awards a sabotage card. */
  cardMinLength: number;
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

/** Per-player sabotage state for the current round. Reset at every round boundary. */
export interface PlayerSabotage {
  /** Card ids. Private: only ever sent to this player. */
  hand: string[];
  /** 0 means never. */
  lastCardEarnedAt: number;
  lastCardPlayedAt: number;
  /** Milliseconds removed from this player's deadline by Clock Thief (capped). */
  personalDeadlineOffset: number;
  /** New effects bounce off until this time (hit immunity, Cleanse). */
  immuneUntil: number;
  /** Sabotages received this round (for the per-target cap). */
  hitsTaken: number;
  /** Points from cashing in cards with a full hand. */
  cashIn: number;
  /** Points earned from an active Bounty. */
  bountyBonus: number;
}

/** Server-side player record. The token never leaves the server except to its owner. */
export interface ServerPlayer extends Player {
  token: string;
  sabotage: PlayerSabotage;
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
  /** Net points from sabotage cards (cash-ins, Bounty, Heist). Can be negative after a Heist. */
  cardPoints: number;
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
  /** Absent when sabotage was off (and in rooms created before cards existed). */
  sabotage?: RoundSabotageResult;
}

export interface SabotagePlayerStats {
  played: number;
  hits: number;
  reflects: number;
  cashIn: number;
  bounty: number;
  /** Positive for the robber, negative for the robbed. */
  heist: number;
}

export interface ResolvedHeist {
  sourceId: string;
  targetId: string;
  points: number;
}

export interface ReflectRecord {
  /** The shielded player who bounced the card. */
  playerId: string;
  /** Who played the card (and got it back). */
  attackerId: string;
  cardId: string;
}

export interface RoundSabotageResult {
  players: Record<string, SabotagePlayerStats>;
  heists: ResolvedHeist[];
  reflects: ReflectRecord[];
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

export type EffectType =
  | "fog"
  | "ink"
  | "jelly"
  | "spin"
  | "padlock"
  | "tiny"
  | "scramble"
  | "mirror"
  | "clock"
  | "lights-out"
  | "shield"
  | "cleanse"
  | "black-hole"
  | "bounty"
  | "heist"
  | "chaos";

/** A timed effect on one player. Public (icons on the host screen); only the target renders it. */
export interface ActiveEffect {
  id: string;
  /** The card whose effect is applied (for Chaos Shuffle, the randomly assigned card). */
  cardId: string;
  effectType: EffectType;
  sourceId: string;
  targetId: string;
  startedAt: number;
  expiresAt: number;
  /** Set when a Shield bounced this back at the player who played it. */
  reflected?: boolean;
  /** Set when this effect came from a Chaos Shuffle. */
  viaCardId?: string;
  /**
   * Server-chosen tile indexes so every reconnect renders the same thing:
   * covered tiles (Ink, Black Hole), locked tiles (Padlock), or a slot permutation (Scramble).
   */
  tiles?: number[];
}

export interface PendingHeist {
  id: string;
  sourceId: string;
  targetId: string;
}

/** Public feed entry. Never contains private information (hands, words). */
export interface SabotageEvent {
  id: string;
  at: number;
  cardId: string;
  sourceId: string;
  /** Who the card landed on (after any reflect). */
  targetIds: string[];
  /** The shielded player who reflected it back at the source. */
  reflectedBy?: string;
  /** Chaos Shuffle: the card each target was assigned. */
  assigned?: Record<string, string>;
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
  /** Sabotage feed for the current round. */
  eventLog: SabotageEvent[];
  activeEffects: ActiveEffect[];
  pendingHeists: PendingHeist[];
  /** Counter for unique effect/event ids within the room. */
  sabotageSeq: number;
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
  cardsPlayed: number;
  hitsTaken: number;
  reflects: number;
}
