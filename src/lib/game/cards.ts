import type { ActiveEffect, Player, Room } from "./types";

export type CardTier = "common" | "rare" | "legendary";
export type CardTargeting = "rival" | "self" | "leader" | "all-others";

export interface CardDefinition {
  id: string;
  name: string;
  tier: CardTier;
  emoji: string;
  description: string;
  durationMs: number;
  targeting: CardTargeting;
  effectType: string;
}

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  "fog-machine": {
    id: "fog-machine",
    name: "Fog Machine",
    tier: "common",
    emoji: "🌫️",
    description: "Blurs the target's board.",
    durationMs: 8_000,
    targeting: "rival",
    effectType: "blur",
  },
  "ink-splat": {
    id: "ink-splat",
    name: "Ink Splat",
    tier: "common",
    emoji: "🖊️",
    description: "Covers random tiles.",
    durationMs: 8_000,
    targeting: "rival",
    effectType: "ink",
  },
  "jelly-board": {
    id: "jelly-board",
    name: "Jelly Board",
    tier: "common",
    emoji: "🧊",
    description: "Tiles wobble visually.",
    durationMs: 7_000,
    targeting: "rival",
    effectType: "wiggle",
  },
  "spin-cycle": {
    id: "spin-cycle",
    name: "Spin Cycle",
    tier: "common",
    emoji: "🌀",
    description: "Rotates the board view.",
    durationMs: 8_000,
    targeting: "rival",
    effectType: "spin",
  },
  padlock: {
    id: "padlock",
    name: "Padlock",
    tier: "common",
    emoji: "🔒",
    description: "Locks random tiles.",
    durationMs: 6_000,
    targeting: "rival",
    effectType: "lock",
  },
  "tiny-print": {
    id: "tiny-print",
    name: "Tiny Print",
    tier: "common",
    emoji: "🔎",
    description: "Shrinks the board letters.",
    durationMs: 8_000,
    targeting: "rival",
    effectType: "tiny",
  },
  "scramble-eggs": {
    id: "scramble-eggs",
    name: "Scramble Eggs",
    tier: "rare",
    emoji: "🥚",
    description: "Shuffles tile positions.",
    durationMs: 10_000,
    targeting: "rival",
    effectType: "shuffle",
  },
  "mirror-mirror": {
    id: "mirror-mirror",
    name: "Mirror Mirror",
    tier: "rare",
    emoji: "🪞",
    description: "Mirrors the board view.",
    durationMs: 10_000,
    targeting: "rival",
    effectType: "mirror",
  },
  "clock-thief": {
    id: "clock-thief",
    name: "Clock Thief",
    tier: "rare",
    emoji: "⏳",
    description: "Steals 5s from the target's personal deadline.",
    durationMs: 0,
    targeting: "rival",
    effectType: "time",
  },
  "lights-out": {
    id: "lights-out",
    name: "Lights Out",
    tier: "rare",
    emoji: "💡",
    description: "Darkens the target's view.",
    durationMs: 6_000,
    targeting: "rival",
    effectType: "dark",
  },
  shield: {
    id: "shield",
    name: "Shield",
    tier: "rare",
    emoji: "🛡️",
    description: "Reflects the next sabotage.",
    durationMs: 20_000,
    targeting: "self",
    effectType: "shield",
  },
  cleanse: {
    id: "cleanse",
    name: "Cleanse",
    tier: "rare",
    emoji: "✨",
    description: "Clears active effects and grants immunity.",
    durationMs: 0,
    targeting: "self",
    effectType: "cleanse",
  },
  "black-hole": {
    id: "black-hole",
    name: "Black Hole",
    tier: "legendary",
    emoji: "🕳️",
    description: "Hides tiles on every other board.",
    durationMs: 6_000,
    targeting: "all-others",
    effectType: "vortex",
  },
  bounty: {
    id: "bounty",
    name: "Bounty",
    tier: "legendary",
    emoji: "👑",
    description: "Marks the score leader.",
    durationMs: 0,
    targeting: "leader",
    effectType: "bounty",
  },
  heist: {
    id: "heist",
    name: "Heist",
    tier: "legendary",
    emoji: "💰",
    description: "Steals points at reveal.",
    durationMs: 0,
    targeting: "rival",
    effectType: "heist",
  },
  "chaos-shuffle": {
    id: "chaos-shuffle",
    name: "Chaos Shuffle",
    tier: "legendary",
    emoji: "🎲",
    description: "Assigns a random visual effect to everyone else.",
    durationMs: 8_000,
    targeting: "all-others",
    effectType: "chaos",
  },
} as const;

export const CARD_LIST = Object.values(CARD_DEFINITIONS);

export function getCardPoolForWord(word: string, roll = Math.random()): CardDefinition[] {
  const letters = word.replace(/[^a-z]/gi, "");
  const len = letters.length;
  if (len >= 5 && letters.includes("qu")) {
    return roll < 0.3 ? [CARD_DEFINITIONS["scramble-eggs"], CARD_DEFINITIONS["clock-thief"], CARD_DEFINITIONS["shield"], CARD_DEFINITIONS["black-hole"], CARD_DEFINITIONS["chaos-shuffle"]].filter(Boolean) : CARD_LIST.filter((card) => card.tier === "legendary");
  }
  if (len >= 8) {
    return roll < 0.3 ? CARD_LIST.filter((card) => card.tier === "rare") : CARD_LIST.filter((card) => card.tier === "legendary");
  }
  if (len >= 6 && len <= 7) {
    return roll < 0.25 ? CARD_LIST.filter((card) => card.tier === "common") : CARD_LIST.filter((card) => card.tier === "rare");
  }
  if (len === 5) {
    return roll < 0.8 ? CARD_LIST.filter((card) => card.tier === "common") : CARD_LIST.filter((card) => card.tier === "rare");
  }
  if (len === 4) {
    return CARD_LIST.filter((card) => card.tier === "common");
  }
  return [];
}

export function pickCardForWord(word: string, rng: () => number = Math.random): CardDefinition | null {
  const pool = getCardPoolForWord(word, rng());
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

export interface CardAwardResult {
  granted: boolean;
  reason?: "cooldown" | "hand_full" | "disabled" | "too_short" | "no_card" | "missing_player";
  cardId?: string;
  pointsAwarded?: number;
}

export function awardCard(room: Room, playerId: string, word: string, now: number, rng: () => number = Math.random): CardAwardResult {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { granted: false, reason: "missing_player" };
  if (!room.settings.sabotageEnabled) return { granted: false, reason: "disabled" };
  if (word.length < room.settings.cardMinLength) return { granted: false, reason: "too_short" };
  if (player.lastCardEarnedAt && now - player.lastCardEarnedAt < 6_000) return { granted: false, reason: "cooldown" };

  const card = pickCardForWord(word, rng);
  if (!card) return { granted: false, reason: "no_card" };
  if (player.hand.length >= 3) {
    player.score += 1;
    player.lastCardEarnedAt = now;
    return { granted: false, reason: "hand_full", pointsAwarded: 1 };
  }

  player.hand.push(card.id);
  player.lastCardEarnedAt = now;
  return { granted: true, cardId: card.id };
}

export function ensureRoundLockout(room: Room, now: number): boolean {
  if (!room.round) return false;
  const firstWindow = room.round.startsAt + 10_000;
  const lastWindow = room.round.endsAt - 8_000;
  return now < firstWindow || now > lastWindow;
}

export function activeEffectsForTarget(room: Room, targetId: string): ActiveEffect[] {
  return room.activeEffects.filter((effect) => effect.targetId === targetId);
}

export function hasSameEffectType(room: Room, targetId: string, effectType: string): boolean {
  return activeEffectsForTarget(room, targetId).some((effect) => effect.effectType === effectType);
}

export function playerCanReceiveEffect(room: Room, targetId: string, effectType: string, now: number): boolean {
  if (hasSameEffectType(room, targetId, effectType)) return false;
  const target = room.players.find((p) => p.id === targetId);
  if (!target) return false;
  const recent = activeEffectsForTarget(room, targetId).find((effect) => now < effect.expiresAt && effect.effectType === effectType);
  if (recent) return false;
  return true;
}

export function playCard(room: Room, playerId: string, cardId: string, targetId?: string | null, now = Date.now()): { ok: boolean; reason?: string; effect?: ActiveEffect; card?: CardDefinition } {
  const player = room.players.find((p) => p.id === playerId);
  const card = CARD_DEFINITIONS[cardId];
  if (!player || !card) return { ok: false, reason: "invalid_card" };
  if (!room.settings.sabotageEnabled) return { ok: false, reason: "disabled" };
  if (!room.round || room.phase !== "ROUND") return { ok: false, reason: "wrong_phase" };
  if (now - player.lastCardPlayedAt < 4_000) return { ok: false, reason: "rate_limited" };
  if (ensureRoundLockout(room, now)) return { ok: false, reason: "time_locked" };

  const index = player.hand.indexOf(cardId);
  if (index < 0) return { ok: false, reason: "not_in_hand" };

  let resolvedTargetId = targetId ?? null;
  if (card.targeting === "self") resolvedTargetId = playerId;
  if (card.targeting === "leader") {
    const leader = [...room.players].sort((a, b) => b.score - a.score)[0];
    if (!leader || leader.id === playerId) return { ok: false, reason: "invalid_target" };
    resolvedTargetId = leader.id;
  }
  if (card.targeting === "all-others") {
    resolvedTargetId = playerId;
  }
  if (card.targeting === "rival") {
    if (!resolvedTargetId || resolvedTargetId === playerId) return { ok: false, reason: "invalid_target" };
    if (!room.players.some((p) => p.id === resolvedTargetId)) return { ok: false, reason: "invalid_target" };
  }

  if (card.effectType === "shield") {
    const shieldIsActive = room.activeEffects.some((effect) => effect.targetId === playerId && effect.cardId === "shield");
    if (shieldIsActive) return { ok: false, reason: "already_protected" };
  }

  const target = resolvedTargetId ? room.players.find((p) => p.id === resolvedTargetId) : null;
  const recentHits = target
    ? room.activeEffects.filter((effect) => effect.targetId === target.id && effect.startedAt >= room.round!.startsAt).length
    : 0;
  if (card.targeting === "rival" && target && !target.lastSeenAt) {
    return { ok: false, reason: "invalid_target" };
  }

  if (target && card.effectType !== "cleanse" && card.effectType !== "heist" && card.effectType !== "time") {
    if (recentHits >= 3) {
      return { ok: false, reason: "target_cap" };
    }
    if (target.lastHitAt && now - target.lastHitAt < 3_000 && card.id !== "black-hole" && card.id !== "chaos-shuffle") {
      return { ok: false, reason: "immunity" };
    }
    if (activeEffectsForTarget(room, target.id).some((effect) => effect.effectType === card.effectType)) {
      player.hand.splice(index, 1);
      player.hand.push(card.id);
      return { ok: false, reason: "stacked" };
    }
  }

  if (card.targeting === "rival" || card.targeting === "leader" || card.targeting === "all-others") {
    const targetPlayer = room.players.find((p) => p.id === resolvedTargetId!);
    const shield = targetPlayer
      ? room.activeEffects.find((effect) => effect.targetId === targetPlayer.id && effect.cardId === "shield")
      : undefined;
    if (targetPlayer && shield && card.id !== "black-hole" && card.id !== "chaos-shuffle") {
      room.activeEffects = room.activeEffects.filter((effect) => effect.id !== shield.id);
      player.lastCardPlayedAt = now;
      const reflectedEffect: ActiveEffect = {
        id: `reflect-${Date.now()}`,
        cardId: card.id,
        sourceId: targetPlayer.id,
        targetId: playerId,
        startedAt: now,
        expiresAt: now + card.durationMs,
        effectType: card.effectType,
        reflected: true,
      };
      room.activeEffects.push(reflectedEffect);
      player.hand.splice(index, 1);
      return { ok: true, effect: reflectedEffect, card };
    }
  }

  if (card.effectType === "cleanse") {
    room.activeEffects = room.activeEffects.filter((effect) => effect.targetId !== playerId);
    player.personalDeadlineOffset = Math.min(15_000, Math.max(0, player.personalDeadlineOffset));
    player.lastCardPlayedAt = now;
    player.hand.splice(index, 1);
    return { ok: true, card };
  }

  if (card.effectType === "time") {
    const targetPlayer = room.players.find((p) => p.id === resolvedTargetId!);
    if (!targetPlayer) return { ok: false, reason: "invalid_target" };
    targetPlayer.personalDeadlineOffset = Math.min(15_000, (targetPlayer.personalDeadlineOffset ?? 0) + 5_000);
    if (targetPlayer.lastHitAt && now - targetPlayer.lastHitAt < 3_000) return { ok: false, reason: "immunity" };
    targetPlayer.lastHitAt = now;
    player.lastCardPlayedAt = now;
    player.hand.splice(index, 1);
    return { ok: true, card };
  }

  if (card.effectType === "heist") {
    room.pendingHeists.push({ id: `${card.id}-${Date.now()}`, sourceId: playerId, targetId: resolvedTargetId!, points: 3 });
    player.lastCardPlayedAt = now;
    player.hand.splice(index, 1);
    return { ok: true, card };
  }

  const targetPlayer = target ?? null;
  const effectDuration = Math.max(1_000, card.durationMs * (recentHits >= 2 ? 0.6 : 1));
  const effect: ActiveEffect = {
    id: `${card.id}-${Date.now()}-${Math.random()}`,
    cardId: card.id,
    sourceId: playerId,
    targetId: resolvedTargetId ?? playerId,
    startedAt: now,
    expiresAt: now + effectDuration,
    effectType: card.effectType,
  };

  if (targetPlayer) targetPlayer.lastHitAt = now;
  player.hand.splice(index, 1);
  player.lastCardPlayedAt = now;
  room.activeEffects.push(effect);
  return { ok: true, effect, card };
}

export function clearExpiredEffects(room: Room, now: number): void {
  room.activeEffects = room.activeEffects.filter((effect) => effect.expiresAt > now);
}

export function resolveHeist(room: Room): void {
  for (const heist of room.pendingHeists) {
    const source = room.players.find((p) => p.id === heist.sourceId);
    const target = room.players.find((p) => p.id === heist.targetId);
    if (!source || !target) continue;
    const stolen = Math.min(heist.points, target.score);
    target.score = Math.max(0, target.score - stolen);
    source.score += stolen;
  }
  room.pendingHeists = [];
}
