import { describe, expect, it } from "vitest";
import { boardFromRows } from "../board";
import { CARD_RULES, CHAOS_POOL, getCard } from "../cards";
import { mulberry32 } from "../rng";
import {
  aggregateSabotage,
  applyBounty,
  awardCard,
  drawCard,
  drawTier,
  findBountyTarget,
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

describe("card awards", () => {
  it("draws tiers by word length", () => {
    expect(drawTier("cat", always(0))).toBeNull();
    expect(drawTier("cats", always(0))).toBe("common");
    expect(drawTier("cats", always(0.99))).toBe("common");
    expect(drawTier("crane", always(0.19))).toBe("rare");
    expect(drawTier("crane", always(0.2))).toBe("common");
    expect(drawTier("planet", always(0.24))).toBe("common");
    expect(drawTier("planets", always(0.25))).toBe("rare");
    expect(drawTier("triangle", always(0.29))).toBe("rare");
    expect(drawTier("triangle", always(0.3))).toBe("legendary");
    expect(drawTier("quilt", always(0.5))).toBe("legendary");
    // Qu only upgrades words of 5+ letters
    expect(drawTier("quit", always(0.5))).toBe("common");
  });

  it("matches the configured probability splits with a seeded RNG", () => {
    const rate = (word: string, tier: string) => {
      const rng = mulberry32(42);
      let hits = 0;
      for (let i = 0; i < 20_000; i++) if (drawCard(word, rng)!.tier === tier) hits++;
      return hits / 20_000;
    };
    expect(rate("cats", "common")).toBe(1);
    expect(rate("crane", "rare")).toBeCloseTo(0.2, 1);
    expect(rate("planet", "common")).toBeCloseTo(0.25, 1);
    expect(rate("planets", "legendary")).toBe(0);
    expect(rate("triangle", "rare")).toBeCloseTo(0.3, 1);
    expect(rate("quilt", "legendary")).toBeCloseTo(0.7, 1);
  });

  it("never awards for 3-letter words and honours the host's minimum length", () => {
    const room = liveRoom();
    expect(awardCard(room, "p0", "cat", 1_000, always(0))).toMatchObject({ kind: "none", reason: "too_short" });
    room.settings.cardMinLength = 6;
    expect(awardCard(room, "p0", "crane", 1_000, always(0))).toMatchObject({ kind: "none", reason: "too_short" });
    expect(awardCard(room, "p0", "planet", 1_000, always(0))).toMatchObject({ kind: "card" });
    room.settings.sabotageEnabled = false;
    expect(awardCard(room, "p0", "planet", 99_000, always(0))).toMatchObject({ kind: "none", reason: "disabled" });
  });

  it("enforces the earn cooldown", () => {
    const room = liveRoom();
    expect(awardCard(room, "p0", "cats", 1_000, always(0)).kind).toBe("card");
    expect(awardCard(room, "p0", "dogs", 1_000 + CARD_RULES.earnCooldownMs - 1, always(0))).toMatchObject({ kind: "none", reason: "cooldown" });
    expect(awardCard(room, "p0", "dogs", 1_000 + CARD_RULES.earnCooldownMs, always(0)).kind).toBe("card");
    expect(player(room, "p0").sabotage.hand).toHaveLength(2);
  });

  it("cashes in for +1 when the hand is full", () => {
    const room = liveRoom();
    const p = player(room, "p0");
    p.sabotage.hand = ["padlock", "padlock", "padlock"];
    expect(awardCard(room, "p0", "cats", 1_000, always(0))).toEqual({ kind: "cashIn", points: 1 });
    expect(p.sabotage.hand).toHaveLength(3);
    // cash-ins respect the cooldown too
    expect(awardCard(room, "p0", "dogs", 2_000, always(0)).kind).toBe("none");
    finishRound(room, [{ round: 1, playerId: "p0", word: "cats", submittedAt: 0 }]);
    // 1 word point + 3 longest-word bonus + 1 cash-in
    expect(room.history[0].players.p0).toMatchObject({ wordPoints: 1, bonus: 3, cardPoints: 1, total: 5 });
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

  it("rate limits each player to one card every 4 seconds", () => {
    const room = liveRoom();
    expect(play(room, "p0", "padlock", "p1", OPEN).ok).toBe(true);
    const blocked = play(room, "p0", "tiny-print", "p2", OPEN + CARD_RULES.playCooldownMs - 1);
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(player(room, "p0").sabotage.hand).toEqual(["tiny-print"]);
    expect(playCard(room, "p0", "tiny-print", "p2", OPEN + CARD_RULES.playCooldownMs).ok).toBe(true);
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
      t += CARD_RULES.hitImmunityMs + CARD_RULES.playCooldownMs;
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
    const before = player(room, "p2").sabotage.lastCardPlayedAt;
    const again = play(room, "p2", "fog-machine", "p1", OPEN + 4_000);
    expect(again).toMatchObject({ ok: false, reason: "already_active" });
    expect(player(room, "p2").sabotage.hand).toEqual(["fog-machine"]);
    expect(player(room, "p2").sabotage.lastCardPlayedAt).toBe(before);
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
