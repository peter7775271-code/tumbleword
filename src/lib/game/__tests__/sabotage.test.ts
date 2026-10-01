import { describe, expect, it } from "vitest";
import { boardFromRows } from "../board";
import { CARD_RULES, CHAOS_POOL, DROP_WEIGHTS, getCard } from "../cards";
import { mulberry32 } from "../rng";
import {
  aggregateSabotage,
  applyBounty,
  dealCards,
  drawCard,
  drawTier,
  findBountyTarget,
  nextDealAt,
  playCard,
  resolveRoundSabotage,
  sabotageAwards,
} from "../sabotage";
import { addPlayer, createRoom, finishRound, normalizeRoom } from "../state-machine";
import { scoreRound } from "../scoring";
import type { Room, ServerPlayer, Submission } from "../types";

const START = 0;
const END = 90_000;
const OPEN = START + CARD_RULES.lockoutStartMs;
const always = (v: number) => () => v;

/** A room mid-round with `n` connected players p0..p(n-1). */
function liveRoom(n = 3): Room {
  const room = createRoom("ABCD", "host", 0);
  for (let i = 0; i < n; i++) addPlayer(room, { id: `p${i}`, token: `t${i}`, nickname: `P${i}` }, 0);
  room.phase = "ROUND";
  room.round = {
    number: 1,
    board: boardFromRows(["CATS", "DOGE", "RAIN", "QUIT"]),
    solution: [],
    startsAt: START,
    endsAt: END,
    hintsUsed: {},
  };
  return room;
}

const player = (room: Room, id: string) => room.players.find((p) => p.id === id)!;

/** Marks everyone as recently seen (targets must be connected) and gives `id` a card. */
function give(room: Room, id: string, cardId: string, now: number): ServerPlayer {
  for (const p of room.players) p.lastSeenAt = now;
  const p = player(room, id);
  p.sabotage.hand.push(cardId);
  return p;
}

function play(room: Room, id: string, cardId: string, target: string | null, now: number, progress: Record<string, number> = {}) {
  give(room, id, cardId, now);
  return playCard(room, id, cardId, target, now, { rng: mulberry32(7), progress });
}

describe("card dealing", () => {
  const INTERVAL = 5_000;

  it("draws tiers by the configured weights", () => {
    expect(drawTier(always(0))).toBe("common");
    expect(drawTier(always(0.59))).toBe("common");
    expect(drawTier(always(0.61))).toBe("rare");
    expect(drawTier(always(0.89))).toBe("rare");
    expect(drawTier(always(0.91))).toBe("legendary");
    expect(drawTier(always(0.999))).toBe("legendary");
  });

  it("matches the configured probability splits with a seeded RNG", () => {
    const rng = mulberry32(42);
    const counts: Record<string, number> = { common: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < 20_000; i++) counts[drawCard(rng).tier]++;
    expect(counts.common / 20_000).toBeCloseTo(DROP_WEIGHTS.common, 1);
    expect(counts.rare / 20_000).toBeCloseTo(DROP_WEIGHTS.rare, 1);
    expect(counts.legendary / 20_000).toBeCloseTo(DROP_WEIGHTS.legendary, 1);
  });

  it("deals every active player a card each interval", () => {
    const room = liveRoom();
    room.settings.cardIntervalSeconds = INTERVAL / 1000;
    expect(dealCards(room, INTERVAL - 1, always(0))).toEqual([]);
    expect(dealCards(room, INTERVAL, always(0))).toEqual(["p0", "p1", "p2"]);
    expect(player(room, "p0").sabotage.hand).toHaveLength(1);
    expect(nextDealAt(room, player(room, "p0"))).toBe(2 * INTERVAL);
    // Calling again before the next deal does nothing.
    expect(dealCards(room, 2 * INTERVAL - 1, always(0))).toEqual([]);
    expect(player(room, "p0").sabotage.hand).toHaveLength(1);
  });

  it("catches up on missed deals but never overfills the hand", () => {
    const room = liveRoom(1);
    room.settings.cardIntervalSeconds = INTERVAL / 1000;
    dealCards(room, 2 * INTERVAL, always(0));
    expect(player(room, "p0").sabotage.hand).toHaveLength(2);
    dealCards(room, 10 * INTERVAL, always(0));
    expect(player(room, "p0").sabotage.hand).toHaveLength(CARD_RULES.maxHandSize);
    // Deals that hit a full hand are skipped, not queued.
    player(room, "p0").sabotage.hand.pop();
    dealCards(room, 10 * INTERVAL + 1, always(0));
    expect(player(room, "p0").sabotage.hand).toHaveLength(CARD_RULES.maxHandSize - 1);
    dealCards(room, 11 * INTERVAL, always(0));
    expect(player(room, "p0").sabotage.hand).toHaveLength(CARD_RULES.maxHandSize);
  });

  it("skips spectators, stops before the closing lockout, and respects the toggle", () => {
    const room = liveRoom(2);
    player(room, "p1").status = "spectating";
    expect(dealCards(room, INTERVAL, always(0))).toEqual(["p0"]);
    expect(nextDealAt(room, player(room, "p1"))).toBeNull();

    const late = liveRoom(1);
    player(late, "p0").sabotage.nextCardAt = END - CARD_RULES.lockoutEndMs;
    expect(dealCards(late, END - 1, always(0))).toEqual([]);
    expect(nextDealAt(late, player(late, "p0"))).toBeNull();

    const off = liveRoom(1);
    off.settings.sabotageEnabled = false;
    expect(dealCards(off, INTERVAL, always(0))).toEqual([]);
    expect(nextDealAt(off, player(off, "p0"))).toBeNull();
  });

  it("stops dealing once Clock Thief has run out a player's time", () => {
    const room = liveRoom(1);
    const p = player(room, "p0");
    p.sabotage.personalDeadlineOffset = END - 3 * INTERVAL;
    dealCards(room, END, always(0));
    expect(p.sabotage.hand).toHaveLength(2);
  });
});

describe("playing cards", () => {
  it("applies a rival effect and spends the card", () => {
    const room = liveRoom();
    const res = play(room, "p0", "fog-machine", "p1", OPEN);
    expect(res.ok).toBe(true);
    expect(player(room, "p0").sabotage.hand).toEqual([]);
    expect(room.activeEffects).toEqual([expect.objectContaining({ cardId: "fog-machine", effectType: "fog", sourceId: "p0", targetId: "p1", startedAt: OPEN, expiresAt: OPEN + 8_000 })]);
    expect(room.eventLog).toEqual([expect.objectContaining({ cardId: "fog-machine", sourceId: "p0", targetIds: ["p1"] })]);
  });

  it("locks cards in the countdown, the first 10s, the last 8s and the reveal", () => {
    const room = liveRoom();
    expect(play(room, "p0", "padlock", "p1", OPEN - 1)).toMatchObject({ ok: false, reason: "locked_early" });
    expect(play(room, "p0", "padlock", "p1", END - CARD_RULES.lockoutEndMs)).toMatchObject({ ok: false, reason: "locked_late" });
    expect(play(room, "p0", "padlock", "p1", OPEN).ok).toBe(true);
    room.phase = "COUNTDOWN";
    expect(play(room, "p0", "padlock", "p2", 50_000)).toMatchObject({ ok: false, reason: "wrong_phase" });
    room.phase = "REVEAL";
    expect(play(room, "p0", "padlock", "p2", 50_000)).toMatchObject({ ok: false, reason: "wrong_phase" });
  });

  it("lets a player fire cards back to back", () => {
    const room = liveRoom();
    expect(play(room, "p0", "padlock", "p1", OPEN).ok).toBe(true);
    expect(play(room, "p0", "tiny-print", "p2", OPEN).ok).toBe(true);
    expect(play(room, "p0", "shield", null, OPEN).ok).toBe(true);
    expect(player(room, "p0").sabotage.hand).toEqual([]);
  });

  it("refuses self-targeting, disconnected and spectating rivals", () => {
    const room = liveRoom();
    expect(play(room, "p0", "padlock", "p0", OPEN)).toMatchObject({ ok: false, reason: "self_target" });
    player(room, "p1").lastSeenAt = OPEN - 60_000;
    expect(playCard(room, "p0", "padlock", "p1", OPEN)).toMatchObject({ ok: false, reason: "target_offline" });
    player(room, "p2").status = "spectating";
    expect(play(room, "p0", "padlock", "p2", OPEN)).toMatchObject({ ok: false, reason: "no_target" });
  });

  it("caps hits per target and shortens durations after two", () => {
    const room = liveRoom(4);
    let t = OPEN;
    const cards = ["fog-machine", "padlock", "tiny-print", "jelly-board"];
    const attackers = ["p2", "p3", "p2"];
    for (let i = 0; i < 3; i++) {
      expect(play(room, attackers[i], cards[i], "p1", t).ok).toBe(true);
      t += CARD_RULES.hitImmunityMs;
    }
    const third = room.activeEffects.find((e) => e.cardId === "tiny-print")!;
    expect(third.expiresAt - third.startedAt).toBe(8_000 * CARD_RULES.reducedDurationFactor);
    const capped = play(room, "p0", cards[3], "p1", t);
    expect(capped).toMatchObject({ ok: false, reason: "target_capped" });
    expect(player(room, "p0").sabotage.hand).toEqual(["jelly-board"]);
  });

  it("gives 3s of immunity after a hit, which Black Hole and Chaos Shuffle ignore", () => {
    const room = liveRoom();
    expect(play(room, "p0", "padlock", "p1", OPEN).ok).toBe(true);
    expect(play(room, "p2", "fog-machine", "p1", OPEN + 2_999)).toMatchObject({ ok: false, reason: "target_immune" });
    expect(player(room, "p2").sabotage.hand).toEqual(["fog-machine"]);
    expect(play(room, "p2", "black-hole", null, OPEN + 2_999).ok).toBe(true);
    expect(room.activeEffects.filter((e) => e.effectType === "black-hole").map((e) => e.targetId).sort()).toEqual(["p0", "p1"]);
  });

  it("refunds a card whose effect is already active on the target", () => {
    const room = liveRoom();
    expect(play(room, "p0", "fog-machine", "p1", OPEN).ok).toBe(true);
    const again = play(room, "p2", "fog-machine", "p1", OPEN + 4_000);
    expect(again).toMatchObject({ ok: false, reason: "already_active" });
    expect(player(room, "p2").sabotage.hand).toEqual(["fog-machine"]);
    expect(room.activeEffects).toHaveLength(1);
    // once it expires the same effect can land again
    expect(playCard(room, "p2", "fog-machine", "p1", OPEN + 8_000).ok).toBe(true);
  });

  it("Cleanse clears effects (but keeps a shield) and grants immunity", () => {
    const room = liveRoom();
    play(room, "p1", "shield", null, OPEN);
    play(room, "p0", "black-hole", null, OPEN);
    expect(play(room, "p1", "cleanse", null, OPEN + 4_000).ok).toBe(true);
    expect(room.activeEffects.filter((e) => e.targetId === "p1").map((e) => e.effectType)).toEqual(["shield"]);
    expect(play(room, "p2", "padlock", "p1", OPEN + 8_999)).toMatchObject({ ok: false, reason: "target_immune" });
  });
});

describe("shield", () => {
  it("reflects the next sabotage back at the sender and is used up", () => {
    const room = liveRoom();
    expect(play(room, "p1", "shield", null, OPEN).ok).toBe(true);
    expect(play(room, "p1", "shield", null, OPEN + 4_000)).toMatchObject({ ok: false, reason: "already_active" });
    const res = play(room, "p0", "fog-machine", "p1", OPEN + 1_000);
    expect(res).toMatchObject({ ok: true, event: { reflectedBy: "p1", targetIds: ["p0"] } });
    expect(room.activeEffects).toEqual([expect.objectContaining({ effectType: "fog", targetId: "p0", sourceId: "p1", reflected: true })]);
    // shield is gone, so the next card lands
    expect(play(room, "p2", "padlock", "p1", OPEN + 2_000).ok).toBe(true);
  });

  it("reflects instant cards like Clock Thief and Heist", () => {
    const room = liveRoom();
    play(room, "p1", "shield", null, OPEN);
    play(room, "p0", "clock-thief", "p1", OPEN + 1_000);
    expect(player(room, "p0").sabotage.personalDeadlineOffset).toBe(5_000);
    expect(player(room, "p1").sabotage.personalDeadlineOffset).toBe(0);
  });

  it("cannot reflect Black Hole or Chaos Shuffle, and stays up", () => {
    const room = liveRoom();
    play(room, "p1", "shield", null, OPEN);
    expect(play(room, "p0", "black-hole", null, OPEN + 1_000).ok).toBe(true);
    expect(room.activeEffects.some((e) => e.effectType === "black-hole" && e.targetId === "p1")).toBe(true);
    expect(room.activeEffects.some((e) => e.effectType === "black-hole" && e.targetId === "p0")).toBe(false);
    expect(play(room, "p2", "chaos-shuffle", null, OPEN + 1_000).ok).toBe(true);
    expect(room.activeEffects.some((e) => e.viaCardId === "chaos-shuffle" && e.targetId === "p1")).toBe(true);
    expect(room.activeEffects.some((e) => e.effectType === "shield" && e.targetId === "p1")).toBe(true);
  });
});

describe("clock thief", () => {
  it("steals 5s, never more than 15s per round, and doesn't extend the attacker", () => {
    const room = liveRoom();
    const p1 = player(room, "p1");
    play(room, "p0", "clock-thief", "p1", OPEN);
    expect(p1.sabotage.personalDeadlineOffset).toBe(5_000);
    expect(player(room, "p0").sabotage.personalDeadlineOffset).toBe(0);
    p1.sabotage.personalDeadlineOffset = 12_000;
    p1.sabotage.hitsTaken = 0;
    play(room, "p2", "clock-thief", "p1", OPEN + 5_000);
    expect(p1.sabotage.personalDeadlineOffset).toBe(15_000);
    p1.sabotage.hitsTaken = 0;
    expect(play(room, "p0", "clock-thief", "p1", OPEN + 10_000)).toMatchObject({ ok: false, reason: "clock_capped" });
  });

  it("blocks card plays after the personal deadline", () => {
    const room = liveRoom();
    player(room, "p0").sabotage.personalDeadlineOffset = 15_000;
    expect(play(room, "p0", "padlock", "p1", END - 15_000)).toMatchObject({ ok: false, reason: "out_of_time" });
  });
});

describe("heist", () => {
  function scored(room: Room, submissions: Omit<Submission, "round" | "submittedAt">[]) {
    const result = scoreRound({
      round: 1,
      board: room.round!.board,
      solution: [],
      submissions: submissions.map((s) => ({ ...s, round: 1, submittedAt: 0 })),
      playerIds: room.players.map((p) => p.id),
    });
    resolveRoundSabotage(room, result);
    return result;
  }

  it("steals up to 3 unique-word points and never goes below 0", () => {
    const room = liveRoom();
    play(room, "p0", "heist", "p1", OPEN);
    // p1: "cats" (1, unique) + longest bonus 3. Only the word point can be stolen.
    const r = scored(room, [{ playerId: "p1", word: "cats" }]);
    expect(r.sabotage!.heists).toEqual([{ sourceId: "p0", targetId: "p1", points: 1 }]);
    expect(r.players.p1).toMatchObject({ wordPoints: 1, bonus: 3, cardPoints: -1, total: 3 });
    expect(r.players.p0).toMatchObject({ cardPoints: 1, total: 1 });
  });

  it("ignores cancelled words and caps at 3", () => {
    const room = liveRoom();
    play(room, "p0", "heist", "p1", OPEN);
    const r = scored(room, [
      { playerId: "p1", word: "cats" },
      { playerId: "p2", word: "cats" },
      { playerId: "p1", word: "toga" },
      { playerId: "p1", word: "drain" },
      { playerId: "p1", word: "quits" },
    ]);
    expect(r.players.p1.wordPoints).toBe(1 + 2 + 2);
    expect(r.sabotage!.heists[0].points).toBe(3);
    expect(r.players.p1.cardPoints).toBe(-3);
  });

  it("shares a victim's unique points across several heists", () => {
    const room = liveRoom();
    room.pendingHeists = [
      { id: "h1", sourceId: "p0", targetId: "p1" },
      { id: "h2", sourceId: "p2", targetId: "p1" },
    ];
    const r = scored(room, [{ playerId: "p1", word: "drain" }, { playerId: "p1", word: "cats" }]);
    expect(r.sabotage!.heists.map((h) => h.points)).toEqual([3, 0]);
    expect(r.players.p1.total).toBeGreaterThanOrEqual(0);
  });

  it("only allows one pending heist per target", () => {
    const room = liveRoom();
    play(room, "p0", "heist", "p1", OPEN);
    expect(play(room, "p2", "heist", "p1", OPEN + 4_000)).toMatchObject({ ok: false, reason: "already_active" });
  });
});

describe("bounty", () => {
  it("targets the leader and isn't playable by the leader", () => {
    const room = liveRoom();
    player(room, "p1").score = 10;
    expect(play(room, "p1", "bounty", null, OPEN)).toMatchObject({ ok: false, reason: "is_leader" });
    expect(play(room, "p0", "bounty", null, OPEN)).toMatchObject({ ok: true, event: { targetIds: ["p1"] } });
    expect(room.activeEffects).toEqual([expect.objectContaining({ effectType: "bounty", targetId: "p1", expiresAt: END })]);
  });

  it("breaks score ties with words found this round", () => {
    const players = [{ id: "a", score: 5 }, { id: "b", score: 5 }, { id: "c", score: 1 }];
    expect(findBountyTarget(players, { a: 2, b: 4 }, "c")).toEqual({ targetId: "b", casterLeads: false });
    expect(findBountyTarget(players, { a: 4, b: 4 }, "a")).toEqual({ targetId: null, casterLeads: true });
  });

  it("pays +1 per 5+ letter word to everyone but the leader, capped at 3", () => {
    const room = liveRoom();
    player(room, "p1").score = 10;
    play(room, "p0", "bounty", null, OPEN);
    const t = OPEN + 1;
    expect(applyBounty(room, "p1", "drain", t)).toBe(false);
    expect(applyBounty(room, "p2", "cats", t)).toBe(false);
    for (let i = 0; i < 3; i++) expect(applyBounty(room, "p2", "drain", t)).toBe(true);
    expect(applyBounty(room, "p2", "drain", t)).toBe(false);
    expect(player(room, "p2").sabotage.bountyBonus).toBe(CARD_RULES.bountyBonusCap);
    finishRound(room, []);
    expect(room.history[0].players.p2).toMatchObject({ cardPoints: 3, total: 3 });
  });
});

describe("chaos shuffle", () => {
  it("assigns each rival its own random visual effect", () => {
    const room = liveRoom(4);
    const res = play(room, "p0", "chaos-shuffle", null, OPEN);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.event.assigned!).sort()).toEqual(["p1", "p2", "p3"]);
    for (const [target, cardId] of Object.entries(res.event.assigned!)) {
      expect(CHAOS_POOL.map((c) => c.id)).toContain(cardId);
      const fx = room.activeEffects.find((e) => e.targetId === target)!;
      expect(fx).toMatchObject({ cardId, viaCardId: "chaos-shuffle", expiresAt: OPEN + getCard("chaos-shuffle")!.durationMs });
    }
    expect(room.activeEffects.some((e) => e.targetId === "p0")).toBe(false);
  });
});

describe("round boundaries and stats", () => {
  it("cleans hands, effects and heists at round end", () => {
    const room = liveRoom();
    play(room, "p0", "heist", "p1", OPEN);
    play(room, "p2", "fog-machine", "p0", OPEN);
    give(room, "p1", "padlock", OPEN);
    finishRound(room, []);
    expect(room.activeEffects).toEqual([]);
    expect(room.pendingHeists).toEqual([]);
    expect(room.eventLog).toEqual([]);
    expect(room.players.every((p) => p.sabotage.hand.length === 0 && p.sabotage.hitsTaken === 0)).toBe(true);
  });

  it("records Most Evil, Most Sabotaged and Best Reflect", () => {
    const room = liveRoom();
    play(room, "p1", "shield", null, OPEN);
    play(room, "p0", "heist", "p1", OPEN + 1_000);
    play(room, "p0", "padlock", "p2", OPEN + 5_000);
    play(room, "p2", "fog-machine", "p0", OPEN + 9_000);
    finishRound(room, []);
    const result = room.history[0].sabotage!;
    expect(result.players.p0).toMatchObject({ played: 2, hits: 2 });
    const awards = sabotageAwards(result);
    expect(awards.mostEvil).toEqual({ playerIds: ["p0"], count: 2 });
    expect(awards.mostSabotaged).toEqual({ playerIds: ["p0"], count: 2 });
    expect(awards.bestReflect).toEqual({ playerId: "p1", attackerId: "p0", cardId: "heist" });
    expect(sabotageAwards(aggregateSabotage(room.history)).mostEvil?.count).toBe(2);
  });

  it("upgrades rooms stored before sabotage existed", () => {
    const room = liveRoom();
    const legacy = JSON.parse(JSON.stringify(room)) as { players: Record<string, unknown>[] };
    for (const p of legacy.players) {
      delete p.sabotage;
      p.hand = ["fog-machine"];
    }
    (legacy as unknown as { eventLog: string[] }).eventLog = ["old"];
    const fixed = normalizeRoom(legacy as unknown as Room);
    expect(fixed.players[0].sabotage.hand).toEqual([]);
    expect(fixed.players[0]).not.toHaveProperty("hand");
    expect(fixed.eventLog).toEqual([]);
    expect(normalizeRoom(fixed)).toBe(fixed);
  });
});
