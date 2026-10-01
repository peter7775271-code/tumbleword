import { describe, expect, it } from "vitest";
import { addPlayer, createRoom } from "../state-machine";
import { awardCard, getCardPoolForWord, playCard, type CardDefinition } from "../cards";

describe("sabotage card flow", () => {
  it("awards common cards for 4-letter words and respects cooldown and hand cap", () => {
    const room = createRoom("ABC", "host-token", 1_000);
    const player = addPlayer(room, { id: "p1", token: "t1", nickname: "Ada" }, 1_000).player;

    const found = getCardPoolForWord("bake", 0.1);
    expect(found).toContainEqual(expect.objectContaining({ tier: "common" }));

    const reward = awardCard(room, "p1", "bake", 1_000, () => 0.1);
    expect(reward.granted).toBe(true);
    expect(player.hand).toHaveLength(1);
    expect(player.lastCardEarnedAt).toBe(1_000);

    const cooldown = awardCard(room, "p1", "boat", 5_000, () => 0.1);
    expect(cooldown.granted).toBe(false);
    expect(cooldown.reason).toBe("cooldown");

    while (player.hand.length < 3) player.hand.push("fog-machine");
    const cap = awardCard(room, "p1", "bake", 20_000, () => 0.1);
    expect(cap.granted).toBe(false);
    expect(cap.reason).toBe("hand_full");
    expect(player.score).toBe(1);
  });

  it("supports rated pools and basic play validation on a live round", () => {
    const room = createRoom("ROOM", "host", 1_000);
    addPlayer(room, { id: "p1", token: "t1", nickname: "Ada" }, 1_000);
    addPlayer(room, { id: "p2", token: "t2", nickname: "Bob" }, 1_000);

    room.phase = "ROUND";
    room.round = {
      number: 1,
      board: { size: 1, tiles: ["a"] },
      solution: [],
      startsAt: 1_000,
      endsAt: 25_000,
      hintsUsed: {},
    };
    const p1 = room.players[0]!;
    const p2 = room.players[1]!;
    p1.lastCardPlayedAt = 0;
    p1.hand = ["fog-machine"];
    const result = playCard(room, "p1", "fog-machine", "p2", 12_000);
    expect(result.ok).toBe(true);
    expect(room.players[0]!.hand).toEqual([]);
    expect(room.activeEffects).toHaveLength(1);

    const blocked = playCard(room, "p1", "fog-machine", "p2", 12_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("rate_limited");

    p1.hand = ["fog-machine"];
    const selfTarget = playCard(room, "p1", "fog-machine", "p1", 17_000);
    expect(selfTarget.ok).toBe(false);
    expect(selfTarget.reason).toBe("invalid_target");

    const badge = room.activeEffects[0] as { cardId: string; targetId: string };
    expect(badge.cardId).toBe("fog-machine");
    expect(badge.targetId).toBe("p2");
  });

  it("falls back to rare and legendary drawers for longer words", () => {
    const common = getCardPoolForWord("giant", 0.9);
    expect(common.some((card: CardDefinition) => card.tier === "rare")).toBe(true);

    const legendary = getCardPoolForWord("quartz", 0.9);
    expect(legendary.some((card: CardDefinition) => card.tier === "legendary")).toBe(true);
  });
});
