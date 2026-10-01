import { CARD_RULES } from "@/lib/game/cards";
import { HINTS_PER_ROUND, MISSED_WORDS_SHOWN } from "@/lib/game/constants";
import { aggregateSabotage, nextDealAt, personalDeadline, sabotageAwards } from "@/lib/game/sabotage";
import { effectivePhase, isHostConnected, isPlayerConnected, vipId } from "@/lib/game/state-machine";
import { finalStats } from "@/lib/game/stats";
import type { Room, ServerPlayer } from "@/lib/game/types";
import type { HostView, PlayerView, PublicPlayer, PublicRoom } from "@/lib/shared/api";

export function toPublicPlayer(p: ServerPlayer, now: number): PublicPlayer {
  return {
    id: p.id,
    nickname: p.nickname,
    color: p.color,
    emoji: p.emoji,
    status: p.status,
    score: p.score,
    cardCount: p.sabotage.hand.length,
    connected: isPlayerConnected(p, now),
  };
}

export function toPublicRoom(room: Room, version: number, progress: Record<string, number>, now: number): PublicRoom {
  const phase = effectivePhase(room, now);
  const showResult = phase === "REVEAL" || phase === "FINAL";
  const inRound = phase === "ROUND" || phase === "COUNTDOWN";
  return {
    code: room.code,
    phase,
    settings: room.settings,
    players: room.players.map((p) => toPublicPlayer(p, now)),
    hostConnected: isHostConnected(room, now),
    vipId: vipId(room, now),
    round: room.round
      ? { number: room.round.number, board: room.round.board, startsAt: room.round.startsAt, endsAt: room.round.endsAt }
      : null,
    activeEffects: inRound ? room.activeEffects.filter((e) => e.expiresAt > now) : [],
    events: inRound ? room.eventLog.slice(-CARD_RULES.feedSize) : [],
    progress: phase === "LOBBY" ? {} : progress,
    lastResult: showResult ? (room.history.at(-1) ?? null) : null,
    final: phase === "FINAL" ? finalStats(room.players, room.history) : null,
    finalAwards: phase === "FINAL" ? sabotageAwards(aggregateSabotage(room.history)) : null,
    version,
    serverNow: now,
  };
}

/** The part of the public room that matters to clients, used to decide whether to broadcast. */
export function publicSignature(room: Room, now: number): string {
  const r = toPublicRoom(room, 0, {}, now);
  return JSON.stringify([
    r.phase,
    r.settings,
    r.players,
    r.hostConnected,
    r.vipId,
    r.round?.number,
    room.history.length,
    room.activeEffects.map((e) => e.id),
    room.eventLog.length,
  ]);
}

export function hostView(publicRoom: PublicRoom): HostView {
  return { kind: "host", room: publicRoom };
}

export function playerView(room: Room, publicRoom: PublicRoom, player: ServerPlayer, myWords: string[]): PlayerView {
  const me = publicRoom.players.find((p) => p.id === player.id)!;
  let myMissed: string[] = [];
  if (publicRoom.phase === "REVEAL" && room.round) {
    const found = new Set(publicRoom.lastResult?.players[player.id]?.words ?? []);
    myMissed = room.round.solution.filter((w) => !found.has(w)).slice(0, MISSED_WORDS_SHOWN);
  }
  const s = player.sabotage;
  return {
    kind: "player",
    room: publicRoom,
    me: { ...me, isVip: publicRoom.vipId === player.id },
    sabotage: {
      hand: s.hand,
      deadline: room.round ? personalDeadline(room.round, s) : null,
      clockStolenMs: s.personalDeadlineOffset,
      immuneUntil: s.immuneUntil,
      nextPlayAt: s.lastCardPlayedAt > 0 ? s.lastCardPlayedAt + CARD_RULES.playCooldownMs : 0,
      nextCardAt: nextDealAt(room, player),
    },
    myWords,
    hintsLeft: room.settings.hints ? Math.max(0, HINTS_PER_ROUND - (room.round?.hintsUsed[player.id] ?? 0)) : 0,
    myMissed,
  };
}
