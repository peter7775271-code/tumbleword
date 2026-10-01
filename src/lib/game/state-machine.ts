import {
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  HOST_TIMEOUT_MS,
  MAX_NICKNAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  PLAYER_EMOJIS,
  PLAYER_TIMEOUT_MS,
  ROUND_SETTLE_MS,
  SETTING_LIMITS,
} from "./constants";
import type { GeneratedBoard } from "./generator";
import { scoreRound } from "./scoring";
import type { Phase, Room, ServerPlayer, Settings, Submission } from "./types";

/*
 * Room state machine:
 *
 *   LOBBY ──start──▶ COUNTDOWN ──(startsAt)──▶ ROUND ──(endsAt + settle)──▶ REVEAL
 *     ▲                  ▲                                                    │
 *     │                  └──────────────next (more rounds left)───────────────┤
 *     └──────────play again────────── FINAL ◀────next (last round)────────────┘
 *
 * Functions here mutate the room passed in (callers pass a clone) and throw
 * GameError on illegal moves. Time is always injected so everything is testable.
 */

export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function assertPhase(room: Room, ...phases: Phase[]) {
  if (!phases.includes(room.phase)) {
    throw new GameError("wrong_phase", `Not allowed during ${room.phase.toLowerCase()}`, 409);
  }
}

export function createRoom(code: string, hostToken: string, now: number): Room {
  return {
    code,
    phase: "LOBBY",
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    kickedIds: [],
    hostToken,
    hostLastSeenAt: now,
    round: null,
    history: [],
    eventLog: [],
    activeEffects: [],
    pendingHeists: [],
    createdAt: now,
  };
}

// ---------- presence ----------

export const isPlayerConnected = (p: ServerPlayer, now: number) => now - p.lastSeenAt < PLAYER_TIMEOUT_MS;
export const isHostConnected = (room: Room, now: number) => now - room.hostLastSeenAt < HOST_TIMEOUT_MS;

/** When the host screen drops, the earliest-joined connected player gets host controls. */
export function vipId(room: Room, now: number): string | null {
  if (isHostConnected(room, now)) return null;
  return room.players.find((p) => isPlayerConnected(p, now))?.id ?? null;
}

export type Actor = { kind: "host" } | { kind: "player"; playerId: string };

export function canControl(room: Room, actor: Actor, now: number): boolean {
  return actor.kind === "host" || vipId(room, now) === actor.playerId;
}

// ---------- players ----------

export function normalizeNickname(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NICKNAME_LENGTH);
}

export interface JoinInput {
  id: string;
  token: string;
  nickname: string;
  emoji?: string;
}

export interface JoinResult {
  player: ServerPlayer;
  reclaimed: boolean;
}

/**
 * Adds a player. A nickname that matches a disconnected player reclaims that seat
 * (lets people rejoin after losing their phone's storage).
 */
export function addPlayer(room: Room, input: JoinInput, now: number): JoinResult {
  const nickname = normalizeNickname(input.nickname);
  if (!nickname) throw new GameError("bad_nickname", "Enter a nickname");
  if (room.kickedIds.includes(input.id)) throw new GameError("kicked", "You were removed from this room", 403);

  const existing = room.players.find((p) => p.nickname.toLowerCase() === nickname.toLowerCase());
  if (existing) {
    if (isPlayerConnected(existing, now)) throw new GameError("name_taken", "That name is taken in this room", 409);
    existing.token = input.token;
    existing.lastSeenAt = now;
    if (input.emoji) existing.emoji = input.emoji;
    return { player: existing, reclaimed: true };
  }

  if (room.players.length >= MAX_PLAYERS) throw new GameError("room_full", "This room is full", 409);

  const usedColors = new Set(room.players.map((p) => p.color));
  const usedEmojis = new Set(room.players.map((p) => p.emoji));
  const emoji =
    input.emoji && (PLAYER_EMOJIS as readonly string[]).includes(input.emoji) && !usedEmojis.has(input.emoji)
      ? input.emoji
      : (PLAYER_EMOJIS.find((e) => !usedEmojis.has(e)) ?? PLAYER_EMOJIS[0]);

  const player: ServerPlayer = {
    id: input.id,
    token: input.token,
    nickname,
    color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0],
    emoji,
    joinedAt: now,
    lastSeenAt: now,
    status: room.phase === "LOBBY" ? "active" : "spectating",
    score: 0,
    hand: [],
    lastCardEarnedAt: 0,
    lastCardPlayedAt: 0,
    personalDeadlineOffset: 0,
    lastHitAt: 0,
  };
  room.players.push(player);
  return { player, reclaimed: false };
}

export function removePlayer(room: Room, playerId: string, kicked: boolean): void {
  const before = room.players.length;
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === before) throw new GameError("no_player", "Player not found", 404);
  if (kicked) room.kickedIds.push(playerId);
}

// ---------- settings ----------

const clamp = (v: number, { min, max, step }: { min: number; max: number; step: number }) =>
  Math.min(max, Math.max(min, Math.round(v / step) * step));

export function updateSettings(room: Room, patch: Partial<Settings>): void {
  assertPhase(room, "LOBBY", "FINAL");
  const s = room.settings;
  if (typeof patch.rounds === "number") s.rounds = clamp(patch.rounds, SETTING_LIMITS.rounds);
  if (typeof patch.roundSeconds === "number") s.roundSeconds = clamp(patch.roundSeconds, SETTING_LIMITS.roundSeconds);
  if (typeof patch.minWords === "number") s.minWords = clamp(patch.minWords, SETTING_LIMITS.minWords);
  if (typeof patch.hints === "boolean") s.hints = patch.hints;
  if (typeof patch.sabotageEnabled === "boolean") s.sabotageEnabled = patch.sabotageEnabled;
  if (typeof patch.cardMinLength === "number") s.cardMinLength = clamp(patch.cardMinLength, { min: 3, max: 8, step: 1 });
}

// ---------- rounds ----------

function beginCountdown(room: Room, number: number, gen: GeneratedBoard, now: number) {
  const startsAt = now + COUNTDOWN_MS;
  room.phase = "COUNTDOWN";
  room.round = {
    number,
    board: gen.board,
    solution: gen.solution,
    startsAt,
    endsAt: startsAt + room.settings.roundSeconds * 1000,
    hintsUsed: {},
  };
  for (const p of room.players) p.status = "active";
}

export function startGame(room: Room, gen: GeneratedBoard, now: number): void {
  assertPhase(room, "LOBBY");
  if (room.players.length < MIN_PLAYERS) {
    throw new GameError("not_enough_players", `Need at least ${MIN_PLAYERS} players`);
  }
  room.history = [];
  room.activeEffects = [];
  room.pendingHeists = [];
  room.eventLog = [];
  for (const p of room.players) {
    p.score = 0;
    p.hand = [];
    p.lastCardEarnedAt = 0;
    p.lastCardPlayedAt = 0;
    p.personalDeadlineOffset = 0;
    p.lastHitAt = 0;
  }
  beginCountdown(room, 1, gen, now);
}

/** Whether advancing from REVEAL will start another round (and so needs a fresh board). */
export function hasNextRound(room: Room): boolean {
  return room.phase === "REVEAL" && (room.round?.number ?? 0) < room.settings.rounds;
}

export function advanceFromReveal(room: Room, gen: GeneratedBoard | null, now: number): void {
  assertPhase(room, "REVEAL");
  if (hasNextRound(room)) {
    if (!gen) throw new Error("A board is required for the next round");
    beginCountdown(room, room.round!.number + 1, gen, now);
  } else {
    room.phase = "FINAL";
  }
}

export function playAgain(room: Room): void {
  assertPhase(room, "FINAL");
  room.phase = "LOBBY";
  room.round = null;
  room.history = [];
  room.activeEffects = [];
  room.pendingHeists = [];
  room.eventLog = [];
  for (const p of room.players) {
    p.score = 0;
    p.status = "active";
    p.hand = [];
    p.lastCardEarnedAt = 0;
    p.lastCardPlayedAt = 0;
    p.personalDeadlineOffset = 0;
    p.lastHitAt = 0;
  }
}

/** Applies purely time-driven transitions. Returns true when the room changed. */
export function advanceTime(room: Room, now: number): boolean {
  if (room.phase === "COUNTDOWN" && room.round && now >= room.round.startsAt) {
    room.phase = "ROUND";
    return true;
  }
  return false;
}

/** The round can be scored once its end time plus a settle window has passed. */
export function isRoundOver(room: Room, now: number): boolean {
  return (room.phase === "ROUND" || room.phase === "COUNTDOWN") && !!room.round && now >= room.round.endsAt + ROUND_SETTLE_MS;
}

export function finishRound(room: Room, submissions: Submission[]): void {
  assertPhase(room, "ROUND", "COUNTDOWN");
  const round = room.round!;
  const active = room.players.filter((p) => p.status === "active");
  const result = scoreRound({
    round: round.number,
    board: round.board,
    solution: round.solution,
    submissions,
    playerIds: active.map((p) => p.id),
  });
  for (const p of active) p.score += result.players[p.id].total;
  room.history.push(result);
  room.phase = "REVEAL";
  room.activeEffects = [];
  room.pendingHeists = [];
  room.eventLog = [];
  for (const p of room.players) {
    p.hand = [];
    p.lastCardEarnedAt = 0;
    p.lastCardPlayedAt = 0;
    p.personalDeadlineOffset = 0;
    p.lastHitAt = 0;
  }
}

/** Effective phase at `now` (a COUNTDOWN whose start time passed is really a ROUND). */
export function effectivePhase(room: Pick<Room, "phase" | "round">, now: number): Phase {
  if (room.phase === "COUNTDOWN" && room.round && now >= room.round.startsAt) return "ROUND";
  return room.phase;
}
