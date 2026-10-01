import { CARD_RULES as R, CHAOS_POOL, DROP_WEIGHTS, cardsInTier, getCard, type CardDefinition, type CardTier } from "./cards";
import { PLAYER_TIMEOUT_MS } from "./constants";
import { shuffle, type Rng } from "./rng";
import type {
  ActiveEffect,
  PlayerSabotage,
  ReflectRecord,
  Room,
  Round,
  RoundResult,
  RoundSabotageResult,
  SabotageEvent,
  SabotagePlayerStats,
  ServerPlayer,
} from "./types";

/*
 * Sabotage rules engine. Like the state machine, every function mutates the room it is
 * given (callers pass a clone), takes time and randomness as arguments, and never touches
 * which words are valid or the shared board.
 */

export function freshSabotage(): PlayerSabotage {
  return { hand: [], nextCardAt: 0, personalDeadlineOffset: 0, immuneUntil: 0, bountyBonus: 0 };
}

/** Drops every hand, effect and pending card so nothing leaks into the next round. */
export function clearSabotage(room: Room): void {
  room.activeEffects = [];
  room.pendingHeists = [];
  room.eventLog = [];
  for (const p of room.players) p.sabotage = freshSabotage();
}

const isConnected = (p: ServerPlayer, now: number) => now - p.lastSeenAt < PLAYER_TIMEOUT_MS;

// ---------- dealing ----------

export function drawTier(rng: Rng): CardTier {
  const tiers = Object.entries(DROP_WEIGHTS) as [CardTier, number][];
  let roll = rng() * tiers.reduce((sum, [, w]) => sum + w, 0);
  for (const [tier, weight] of tiers) {
    roll -= weight;
    if (roll < 0) return tier;
  }
  return tiers[0][0];
}

export function drawCard(rng: Rng): CardDefinition {
  const pool = cardsInTier(drawTier(rng));
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

/** Dealing stops once cards can no longer be played (closing lockout or this player's own deadline). */
function dealStop(round: Round, s: PlayerSabotage): number {
  return Math.min(round.endsAt - R.lockoutEndMs, personalDeadline(round, s));
}

export const cardInterval = (room: Pick<Room, "settings">) => room.settings.cardIntervalSeconds * 1000;

/** First deal of the round: one interval after the round starts. */
export const firstDealAt = (room: Pick<Room, "settings">, round: Pick<Round, "startsAt">) => round.startsAt + cardInterval(room);

/** When this player's next card is dealt, or null if no more cards come this round. */
export function nextDealAt(room: Room, player: ServerPlayer): number | null {
  const round = room.round;
  if (!room.settings.sabotageEnabled || !round || player.status !== "active") return null;
  if (room.phase !== "ROUND" && room.phase !== "COUNTDOWN") return null;
  const at = player.sabotage.nextCardAt || firstDealAt(room, round);
  return at < dealStop(round, player.sabotage) ? at : null;
}

/**
 * Deals every card that has come due since the last call. Serverless has no timers, so this runs
 * lazily on every request (clients also refresh when their next card is due). A deal that finds a
 * full hand is skipped. Returns the ids of players who received cards.
 */
export function dealCards(room: Room, now: number, rng: Rng = Math.random): string[] {
  const round = room.round;
  if (!room.settings.sabotageEnabled || room.phase !== "ROUND" || !round || now < round.startsAt) return [];
  const interval = cardInterval(room);
  const dealt: string[] = [];
  for (const p of room.players) {
    if (p.status !== "active") continue;
    const s = p.sabotage;
    if (s.nextCardAt === 0) s.nextCardAt = firstDealAt(room, round);
    const stop = dealStop(round, s);
    while (s.nextCardAt <= now && s.nextCardAt < stop) {
      if (s.hand.length < R.maxHandSize) {
        s.hand.push(drawCard(rng).id);
        if (!dealt.includes(p.id)) dealt.push(p.id);
      }
      s.nextCardAt += interval;
    }
  }
  return dealt;
}

export function activeBounty(room: Room, now: number): ActiveEffect | null {
  return room.activeEffects.find((e) => e.effectType === "bounty" && e.expiresAt > now) ?? null;
}

/** +1 for a 5+ letter word by anyone but the wanted leader, capped per player. */
export function applyBounty(room: Room, playerId: string, word: string, now: number): boolean {
  const bounty = activeBounty(room, now);
  const player = room.players.find((p) => p.id === playerId);
  if (!bounty || !player || bounty.targetId === playerId || word.length < R.bountyMinWordLength) return false;
  if (player.sabotage.bountyBonus >= R.bountyBonusCap) return false;
  player.sabotage.bountyBonus += 1;
  return true;
}

// ---------- timing ----------

export type CardWindow = "open" | "early" | "late" | "closed";

export function cardWindow(round: Pick<Round, "startsAt" | "endsAt">, now: number): CardWindow {
  if (now < round.startsAt || now >= round.endsAt) return "closed";
  if (now < round.startsAt + R.lockoutStartMs) return "early";
  if (now >= round.endsAt - R.lockoutEndMs) return "late";
  return "open";
}

/** Submissions from this player are rejected after this time. */
export function personalDeadline(round: Pick<Round, "endsAt">, sabotage: Pick<PlayerSabotage, "personalDeadlineOffset">): number {
  return round.endsAt - sabotage.personalDeadlineOffset;
}

export function pruneExpired(room: Room, now: number): void {
  room.activeEffects = room.activeEffects.filter((e) => e.expiresAt > now);
}

// ---------- targeting ----------

export interface LeaderCandidate {
  id: string;
  score: number;
}

/**
 * The Bounty target: highest game score, then most words this round. Ties with the caster
 * count as the caster leading (you can't put a bounty on a co-leader... or yourself).
 */
export function findBountyTarget(candidates: LeaderCandidate[], progress: Record<string, number>, casterId: string): { targetId: string | null; casterLeads: boolean } {
  const key = (p: LeaderCandidate) => [p.score, progress[p.id] ?? 0] as const;
  const cmp = (a: LeaderCandidate, b: LeaderCandidate) => {
    const [as, aw] = key(a);
    const [bs, bw] = key(b);
    return bs - as || bw - aw;
  };
  const caster = candidates.find((p) => p.id === casterId);
  const others = candidates.filter((p) => p.id !== casterId).sort(cmp);
  const top = others[0];
  if (!top) return { targetId: null, casterLeads: false };
  const casterLeads = !!caster && cmp(caster, top) <= 0;
  return { targetId: casterLeads ? null : top.id, casterLeads };
}

// ---------- playing ----------

export type PlayFailure =
  | "unknown_card"
  | "disabled"
  | "wrong_phase"
  | "not_playing"
  | "locked_early"
  | "locked_late"
  | "out_of_time"
  | "not_in_hand"
  | "no_target"
  | "self_target"
  | "target_offline"
  | "is_leader"
  | "target_immune"
  | "already_active"
  | "clock_capped"
  | "no_valid_targets";

export type PlayResult = { ok: true; event: SabotageEvent } | { ok: false; reason: PlayFailure; message: string };

export interface PlayContext {
  /** Words found this round per player (Bounty tie-break). */
  progress?: Record<string, number>;
  rng?: Rng;
}

const fail = (reason: PlayFailure, message: string): PlayResult => ({ ok: false, reason, message });

function nextId(room: Room, prefix: string): string {
  room.sabotageSeq = (room.sabotageSeq ?? 0) + 1;
  return `${prefix}${room.sabotageSeq}`;
}

function hasActive(room: Room, targetId: string, effectType: string, now: number): boolean {
  return room.activeEffects.some((e) => e.targetId === targetId && e.effectType === effectType && e.expiresAt > now);
}

function pickTiles(size: number, count: number, rng: Rng): number[] {
  return shuffle(
    Array.from({ length: size * size }, (_, i) => i),
    rng,
  )
    .slice(0, count)
    .sort((a, b) => a - b);
}

/** A slot permutation where most tiles visibly move. */
function scramblePermutation(size: number, rng: Rng): number[] {
  const n = size * size;
  const ids = Array.from({ length: n }, (_, i) => i);
  let best = ids;
  for (let attempt = 0; attempt < 8; attempt++) {
    const perm = shuffle(ids, rng);
    const moved = perm.filter((slot, i) => slot !== i).length;
    best = perm;
    if (moved >= n * 0.75) break;
  }
  return best;
}

/** Why `card` can't land on `target` right now (null when it can). Refusals leave the card in the sender's hand. */
function landingProblem(room: Room, card: CardDefinition, target: ServerPlayer, now: number, ignoreImmunity: boolean): { reason: PlayFailure; message: string } | null {
  const s = target.sabotage;
  const name = target.nickname;
  if (!ignoreImmunity && !card.ignoresImmunity && now < s.immuneUntil) {
    return { reason: "target_immune", message: `${name} is immune for ${Math.ceil((s.immuneUntil - now) / 1000)}s` };
  }
  switch (card.effectType) {
    case "clock":
      if (s.personalDeadlineOffset >= R.maxClockStolenMs) return { reason: "clock_capped", message: `${name} has no more time to steal` };
      return null;
    case "heist":
      if (room.pendingHeists.some((h) => h.targetId === target.id)) return { reason: "already_active", message: `${name} is already being robbed` };
      return null;
    case "bounty":
      if (activeBounty(room, now)) return { reason: "already_active", message: "A bounty is already active" };
      return null;
    default:
      if (hasActive(room, target.id, card.effectType, now)) return { reason: "already_active", message: `${name} already has ${card.name}` };
      return null;
  }
}

/** Applies a harmful card to one target. Assumes `landingProblem` returned null. */
function land(room: Room, round: Round, card: CardDefinition, sourceId: string, target: ServerPlayer, now: number, rng: Rng, extra: Partial<ActiveEffect> = {}): void {
  const s = target.sabotage;
  s.immuneUntil = Math.max(s.immuneUntil, now + R.hitImmunityMs);

  if (card.effectType === "clock") {
    s.personalDeadlineOffset = Math.min(R.maxClockStolenMs, s.personalDeadlineOffset + R.clockThiefMs);
    return;
  }
  if (card.effectType === "heist") {
    room.pendingHeists.push({ id: nextId(room, "heist-"), sourceId, targetId: target.id });
    return;
  }

  const size = round.board.size;
  let tiles: number[] | undefined;
  if (card.effectType === "ink") tiles = pickTiles(size, R.inkTiles, rng);
  if (card.effectType === "padlock") tiles = pickTiles(size, R.padlockTiles, rng);
  if (card.effectType === "black-hole") tiles = pickTiles(size, R.blackHoleTiles, rng);
  if (card.effectType === "scramble") tiles = scramblePermutation(size, rng);

  const duration = card.effectType === "bounty" ? round.endsAt - now : extra.viaCardId ? (getCard(extra.viaCardId)?.durationMs ?? card.durationMs) : card.durationMs;
  room.activeEffects.push({
    id: nextId(room, "fx-"),
    cardId: card.id,
    effectType: card.effectType,
    sourceId,
    targetId: target.id,
    startedAt: now,
    expiresAt: Math.min(round.endsAt, now + duration),
    ...(tiles ? { tiles } : {}),
    ...extra,
  });
}

function shieldOf(room: Room, playerId: string, now: number): ActiveEffect | null {
  return room.activeEffects.find((e) => e.targetId === playerId && e.effectType === "shield" && e.expiresAt > now) ?? null;
}

/** Server entry point for playing a card. Refused plays change nothing (the card stays in hand). */
export function playCard(room: Room, playerId: string, cardId: string, targetId: string | null | undefined, now: number, ctx: PlayContext = {}): PlayResult {
  const rng = ctx.rng ?? Math.random;
  const card = getCard(cardId);
  const player = room.players.find((p) => p.id === playerId);
  if (!card || !player) return fail("unknown_card", "That card doesn't exist");
  if (!room.settings.sabotageEnabled) return fail("disabled", "Sabotage is turned off");
  const round = room.round;
  if (room.phase !== "ROUND" || !round) return fail("wrong_phase", "Cards can only be played during a round");
  if (player.status !== "active") return fail("not_playing", "You're watching this round");
  const window = cardWindow(round, now);
  if (window === "closed") return fail("wrong_phase", "Cards can only be played during a round");
  if (window === "early") return fail("locked_early", `Cards unlock in ${Math.ceil((round.startsAt + R.lockoutStartMs - now) / 1000)}s`);
  if (window === "late") return fail("locked_late", "Cards are locked for the final seconds");
  if (now >= personalDeadline(round, player.sabotage)) return fail("out_of_time", "Your time is up");
  const handIndex = player.sabotage.hand.indexOf(cardId);
  if (handIndex < 0) return fail("not_in_hand", "That card isn't in your hand");

  pruneExpired(room, now);
  const eligible = (p: ServerPlayer) => p.id !== playerId && p.status === "active" && isConnected(p, now);
  const event: SabotageEvent = { id: "", at: now, cardId, sourceId: playerId, targetIds: [] };

  if (card.targeting === "self") {
    if (card.effectType === "shield") {
      if (shieldOf(room, playerId, now)) return fail("already_active", "Your shield is already up");
      room.activeEffects.push({
        id: nextId(room, "fx-"),
        cardId,
        effectType: "shield",
        sourceId: playerId,
        targetId: playerId,
        startedAt: now,
        expiresAt: Math.min(round.endsAt, now + card.durationMs),
      });
    } else if (card.effectType === "cleanse") {
      room.activeEffects = room.activeEffects.filter((e) => e.targetId !== playerId || e.effectType === "shield");
      player.sabotage.immuneUntil = Math.max(player.sabotage.immuneUntil, now + R.cleanseImmunityMs);
    }
    event.targetIds = [playerId];
  } else if (card.targeting === "all-others") {
    const assigned: Record<string, string> = {};
    for (const target of room.players.filter(eligible)) {
      if (card.effectType === "chaos") {
        const options = CHAOS_POOL.filter((c) => !hasActive(room, target.id, c.effectType, now));
        const pick = options[Math.floor(rng() * options.length)];
        if (!pick) continue;
        land(room, round, pick, playerId, target, now, rng, { viaCardId: card.id });
        assigned[target.id] = pick.id;
      } else {
        if (landingProblem(room, card, target, now, true)) continue;
        land(room, round, card, playerId, target, now, rng);
      }
      event.targetIds.push(target.id);
    }
    if (event.targetIds.length === 0) return fail("no_valid_targets", "Nobody can be hit right now. Card kept.");
    if (card.effectType === "chaos") event.assigned = assigned;
  } else {
    let target: ServerPlayer | undefined;
    if (card.targeting === "leader") {
      const candidates = room.players.filter((p) => p.status === "active" && (p.id === playerId || isConnected(p, now)));
      const { targetId: leaderId, casterLeads } = findBountyTarget(candidates, ctx.progress ?? {}, playerId);
      if (casterLeads) return fail("is_leader", "You're the leader! Bounty only works on someone else");
      target = room.players.find((p) => p.id === leaderId);
      if (!target) return fail("no_target", "There's no leader to put a bounty on");
    } else {
      if (!targetId) return fail("no_target", "Pick someone to sabotage");
      if (targetId === playerId) return fail("self_target", "You can't sabotage yourself");
      target = room.players.find((p) => p.id === targetId);
      if (!target || target.status !== "active") return fail("no_target", "That player isn't in this round");
      if (!isConnected(target, now)) return fail("target_offline", `${target.nickname} is offline`);
    }

    const problem = landingProblem(room, card, target, now, false);
    if (problem) return fail(problem.reason, `${problem.message}. Card kept.`);

    const shield = card.unreflectable ? null : shieldOf(room, target.id, now);
    if (shield) {
      room.activeEffects = room.activeEffects.filter((e) => e.id !== shield.id);
      event.reflectedBy = target.id;
      // The bounce ignores the sender's immunity and shield, but not their cap or stacking.
      if (!landingProblem(room, card, player, now, true)) {
        land(room, round, card, target.id, player, now, rng, { reflected: true });
        event.targetIds = [playerId];
      }
    } else {
      land(room, round, card, playerId, target, now, rng);
      event.targetIds = [target.id];
    }
  }

  player.sabotage.hand.splice(handIndex, 1);
  event.id = nextId(room, "ev-");
  room.eventLog.push(event);
  return { ok: true, event };
}

// ---------- round end ----------

const emptyStats = (): SabotagePlayerStats => ({ played: 0, hits: 0, reflects: 0, bounty: 0, heist: 0 });

/**
 * Folds the round's card points (Bounty, Heist) into the scored result and records
 * stats for the reveal. Heists only take unique-word points and never push the victim below 0.
 */
export function resolveRoundSabotage(room: Room, result: RoundResult): void {
  if (!room.settings.sabotageEnabled) return;
  const players: Record<string, SabotagePlayerStats> = {};
  for (const id of Object.keys(result.players)) players[id] = emptyStats();
  const stat = (id: string) => (players[id] ??= emptyStats());

  for (const p of room.players) {
    const r = result.players[p.id];
    if (!r) continue;
    stat(p.id).bounty = p.sabotage.bountyBonus;
  }

  const heists: RoundSabotageResult["heists"] = [];
  const stolenFrom = new Map<string, number>();
  for (const h of room.pendingHeists) {
    const victim = result.players[h.targetId];
    if (!victim || !result.players[h.sourceId]) continue;
    const already = stolenFrom.get(h.targetId) ?? 0;
    const points = Math.max(0, Math.min(R.heistPoints, victim.wordPoints - already));
    stolenFrom.set(h.targetId, already + points);
    stat(h.sourceId).heist += points;
    stat(h.targetId).heist -= points;
    heists.push({ sourceId: h.sourceId, targetId: h.targetId, points });
  }

  const reflects: ReflectRecord[] = [];
  for (const e of room.eventLog) {
    const card = getCard(e.cardId);
    stat(e.sourceId).played += 1;
    if (card?.targeting !== "self") for (const id of e.targetIds) stat(id).hits += 1;
    if (e.reflectedBy) {
      stat(e.reflectedBy).reflects += 1;
      reflects.push({ playerId: e.reflectedBy, attackerId: e.sourceId, cardId: e.cardId });
    }
  }

  for (const [id, r] of Object.entries(result.players)) {
    const s = players[id];
    r.cardPoints = s.bounty + s.heist;
    r.total = r.wordPoints + r.bonus + r.cardPoints;
  }
  result.sabotage = { players, heists, reflects };
}

export interface SabotageAwards {
  mostEvil: { playerIds: string[]; count: number } | null;
  mostSabotaged: { playerIds: string[]; count: number } | null;
  bestReflect: ReflectRecord | null;
}

const TIER_RANK: Record<CardTier, number> = { common: 0, rare: 1, legendary: 2 };

function leaders(stats: Record<string, SabotagePlayerStats>, key: "played" | "hits") {
  const max = Math.max(0, ...Object.values(stats).map((s) => s[key]));
  if (max === 0) return null;
  return { playerIds: Object.keys(stats).filter((id) => stats[id][key] === max).sort(), count: max };
}

/** "Most Evil", "Most Sabotaged" and "Best Reflect" (the highest-tier card bounced). */
export function sabotageAwards(result: Pick<RoundSabotageResult, "players" | "reflects"> | null | undefined): SabotageAwards {
  if (!result) return { mostEvil: null, mostSabotaged: null, bestReflect: null };
  let bestReflect: ReflectRecord | null = null;
  for (const r of result.reflects) {
    const tier = TIER_RANK[getCard(r.cardId)?.tier ?? "common"];
    if (!bestReflect || tier > TIER_RANK[getCard(bestReflect.cardId)?.tier ?? "common"]) bestReflect = r;
  }
  return { mostEvil: leaders(result.players, "played"), mostSabotaged: leaders(result.players, "hits"), bestReflect };
}

/** Sums sabotage stats across rounds (final screen). */
export function aggregateSabotage(history: RoundResult[]): Pick<RoundSabotageResult, "players" | "reflects"> | null {
  const rounds = history.filter((r) => r.sabotage);
  if (rounds.length === 0) return null;
  const players: Record<string, SabotagePlayerStats> = {};
  const reflects: ReflectRecord[] = [];
  for (const r of rounds) {
    for (const [id, s] of Object.entries(r.sabotage!.players)) {
      const t = (players[id] ??= emptyStats());
      for (const k of Object.keys(s) as (keyof SabotagePlayerStats)[]) t[k] += s[k];
    }
    reflects.push(...r.sabotage!.reflects);
  }
  return { players, reflects };
}
