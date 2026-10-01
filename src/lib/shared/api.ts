import type { Board, Phase, PlayerFinalStats, PlayerStatus, RoundResult, Settings } from "@/lib/game/types";

export type Auth = { role: "host"; token: string } | { role: "player"; playerId: string; token: string };

export interface PublicPlayer {
  id: string;
  nickname: string;
  color: string;
  emoji: string;
  status: PlayerStatus;
  score: number;
  connected: boolean;
}

export interface PublicRound {
  number: number;
  board: Board;
  startsAt: number;
  endsAt: number;
}

/** Everything anyone in the room may see. Never includes tokens, other players' words mid-round, or the solution. */
export interface PublicRoom {
  code: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  hostConnected: boolean;
  vipId: string | null;
  round: PublicRound | null;
  /** Words found so far this round, per player (counts only). */
  progress: Record<string, number>;
  /** The latest scored round (REVEAL and FINAL). */
  lastResult: RoundResult | null;
  final: PlayerFinalStats[] | null;
  version: number;
  serverNow: number;
}

export interface HostView {
  kind: "host";
  room: PublicRoom;
}

export interface PlayerView {
  kind: "player";
  room: PublicRoom;
  me: PublicPlayer & { isVip: boolean };
  /** This player's accepted words for the current round. */
  myWords: string[];
  hintsLeft: number;
  /** REVEAL only: long words on the board this player did not find. */
  myMissed: string[];
}

export type RoomView = HostView | PlayerView;

export interface CreateRoomResponse {
  code: string;
  hostToken: string;
  view: HostView;
}

export interface JoinRequest {
  nickname: string;
  emoji?: string;
  playerId?: string;
  token?: string;
}

export interface JoinResponse {
  playerId: string;
  token: string;
  view: PlayerView;
}

export type RoomAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "playAgain" }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "close" };

export type SubmitOutcome =
  | "accepted"
  | "duplicate"
  | "too_short"
  | "not_a_word"
  | "not_on_board"
  | "round_over"
  | "not_started"
  | "not_playing";

export interface SubmitResponse {
  outcome: SubmitOutcome;
  word: string;
  /** Points if the word stays unique (accepted only). */
  points: number;
  count: number;
}

export interface Hint {
  /** Tile index the word starts on. */
  start: number;
  length: number;
}

export interface HintResponse {
  hint: Hint | null;
  hintsLeft: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
