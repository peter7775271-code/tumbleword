import { HINTS_PER_ROUND, MISSED_WORDS_SHOWN } from "@/lib/game/constants";
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
    connected: isPlayerConnected(p, now),
  };
}

export function toPublicRoom(room: Room, version: number, progress: Record<string, number>, now: number): PublicRoom {
  const phase = effectivePhase(room, now);
  const showResult = phase === "REVEAL" || phase === "FINAL";
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
    progress: phase === "LOBBY" ? {} : progress,
    lastResult: showResult ? (room.history.at(-1) ?? null) : null,
    final: phase === "FINAL" ? finalStats(room.players, room.history) : null,
    version,
    serverNow: now,
  };
}

/** The part of the public room that matters to clients, used to decide whether to broadcast. */
export function publicSignature(room: Room, now: number): string {
  const r = toPublicRoom(room, 0, {}, now);
  return JSON.stringify([r.phase, r.settings, r.players, r.hostConnected, r.vipId, r.round?.number, room.history.length]);
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
  return {
    kind: "player",
    room: publicRoom,
    me: { ...me, isVip: publicRoom.vipId === player.id },
    myWords,
    hintsLeft: room.settings.hints ? Math.max(0, HINTS_PER_ROUND - (room.round?.hintsUsed[player.id] ?? 0)) : 0,
    myMissed,
  };
}
