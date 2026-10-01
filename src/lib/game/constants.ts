import type { Settings } from "./types";

export const GAME_NAME = "Tumbleword";

export const BOARD_SIZE = 4;
export const MIN_WORD_LENGTH = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_NICKNAME_LENGTH = 12;

export const COUNTDOWN_MS = 3_000;
/** Submissions that arrive this long after roundEndsAt are still accepted (network latency). */
export const SUBMIT_GRACE_MS = 300;
/** Scoring waits this long after roundEndsAt so in-flight submissions land first. */
export const ROUND_SETTLE_MS = 1_500;

export const PLAYER_TIMEOUT_MS = 15_000;
export const HOST_TIMEOUT_MS = 20_000;
export const HEARTBEAT_WRITE_MS = 5_000;
export const ROOM_INACTIVE_MS = 30 * 60_000;

export const LONGEST_WORD_BONUS = 3;
export const HINTS_PER_ROUND = 1;
export const MISSED_WORDS_SHOWN = 12;

export const DEFAULT_SETTINGS: Settings = {
  rounds: 3,
  roundSeconds: 90,
  minWords: 40,
  hints: true,
  sabotageEnabled: true,
  cardIntervalSeconds: 5,
};

export const SETTING_LIMITS = {
  rounds: { min: 1, max: 10, step: 1 },
  roundSeconds: { min: 30, max: 300, step: 30 },
  minWords: { min: 0, max: 150, step: 10 },
  cardIntervalSeconds: { min: 2, max: 20, step: 1 },
} as const;

/** Okabe-Ito palette (colorblind-safe), extended to 8 with a neutral. */
export const PLAYER_COLORS = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#BBBBBB",
] as const;

export const PLAYER_EMOJIS = [
  "🦊", "🐙", "🦉", "🐸", "🐝", "🦄", "🐢", "🐳",
  "🦖", "🌵", "🍕", "🚀", "🎸", "🍩", "🐧", "🌈",
] as const;
