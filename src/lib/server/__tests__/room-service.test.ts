import { beforeEach, describe, expect, it } from "vitest";
import { COUNTDOWN_MS, HOST_TIMEOUT_MS, ROUND_SETTLE_MS, SUBMIT_GRACE_MS } from "@/lib/game/constants";
import { solve } from "@/lib/game/solver";
import { Trie } from "@/lib/game/trie";
import type { Auth, PlayerView } from "@/lib/shared/api";
import type { RealtimeEvent } from "@/lib/shared/realtime";
import { createRoomService, type RoomService } from "../room-service";
import { MemoryRoomStore } from "../store/memory";

// Boards are random, so the test dictionary accepts every 3-tile string: any board then has
// plenty of "words", and solutions, hints and missed-word lists are never empty.
const ALL_TILES = [..."abcdefghijklmnoprstuvwxyz", "qu"];
const ALL_TRIGRAMS = ALL_TILES.flatMap((a) => ALL_TILES.flatMap((b) => ALL_TILES.map((c) => a + b + c)));

describe("room service", () => {
  let now: number;
  let service: RoomService;
  let store: MemoryRoomStore;
  let events: RealtimeEvent[];
  const dict = Trie.fromWords(ALL_TRIGRAMS);
  let n: number;

  beforeEach(() => {
    now = 1_000_000;
    n = 0;
    events = [];
    store = new MemoryRoomStore();
    service = createRoomService({
      store,
      dictionary: async () => dict,
      broadcast: async (_code, e) => void events.push(e),
      newRoomCode: () => "BCDF",
      newPlayerId: () => `player-${++n}`,
      newToken: () => `token-${++n}`,
      now: () => now,
    });
  });

  async function setup() {
    const { code, hostToken } = await service.createRoom();
    const host: Auth = { role: "host", token: hostToken };
    await service.act(code, host, { type: "settings", settings: { minWords: 0, roundSeconds: 60, rounds: 1 } });
    const a = await service.join(code, { nickname: "Ada" });
    const b = await service.join(code, { nickname: "Bo" });
    const authA: Auth = { role: "player", playerId: a.playerId, token: a.token };
    const authB: Auth = { role: "player", playerId: b.playerId, token: b.token };
    return { code, host, authA, authB };
  }

  /** Every 3-tile word on the current board. */
  async function boardWords(code: string): Promise<string[]> {
    const board = (await store.getRoom(code))!.room.round!.board;
    return [...solve(board, dict, 3).keys()].filter((w) => w.length === 3);
  }

  it("plays a full round with duplicate cancellation", async () => {
    const { code, host, authA, authB } = await setup();
    const started = await service.act(code, host, { type: "start" });
    expect(started!.room.phase).toBe("COUNTDOWN");
    expect(events.some((e) => e.type === "sync")).toBe(true);

    const words = await boardWords(code);
    const [shared, onlyA, onlyB] = words;

    expect((await service.submit(code, authA, shared, null)).outcome).toBe("not_started");
    now += COUNTDOWN_MS;

    expect((await service.submit(code, authA, shared, null)).outcome).toBe("accepted");
    expect((await service.submit(code, authA, shared, null)).outcome).toBe("duplicate");
    expect((await service.submit(code, authB, shared, null)).outcome).toBe("accepted");
    expect((await service.submit(code, authA, onlyA, null)).outcome).toBe("accepted");
    expect((await service.submit(code, authB, onlyB, null)).outcome).toBe("accepted");
    expect((await service.submit(code, authA, "zz", null)).outcome).toBe("too_short");
    expect((await service.submit(code, authA, "zzzzzz", null)).outcome).toBe("not_on_board");
    expect(events.filter((e) => e.type === "progress")).toHaveLength(4);

    const hostView = await service.sync(code, host);
    expect(hostView.room.phase).toBe("ROUND");
    expect(Object.values(hostView.room.progress).sort()).toEqual([2, 2]);
    // No words leak into the public room during the round
    expect(JSON.stringify(hostView.room)).not.toContain(`"${onlyA}"`);

    const round = (await store.getRoom(code))!.room.round!;
    now = round.endsAt + SUBMIT_GRACE_MS + 1;
    expect((await service.submit(code, authA, words[3] ?? onlyA, null)).outcome).toBe("round_over");

    now = round.endsAt + ROUND_SETTLE_MS;
    const reveal = (await service.sync(code, authA)) as PlayerView;
    expect(reveal.room.phase).toBe("REVEAL");
    const result = reveal.room.lastResult!;
    expect(result.words.find((w) => w.word === shared)).toMatchObject({ cancelled: true, points: 0 });
    expect(result.players[reveal.me.id].uniqueWords).toEqual([onlyA]);
    expect(reveal.myMissed.length).toBeGreaterThan(0);

    const final = await service.act(code, host, { type: "next" });
    expect(final!.room.phase).toBe("FINAL");
    expect(final!.room.final).toHaveLength(2);
  });

  it("validates tile paths sent by the controller", async () => {
    const { code, host, authA } = await setup();
    await service.act(code, host, { type: "start" });
    const words = await boardWords(code);
    now += COUNTDOWN_MS;
    const board = (await store.getRoom(code))!.room.round!.board;
    const path = solve(board, Trie.fromWords([words[0]]))!.get(words[0])!;
    expect((await service.submit(code, authA, words[0], [path[0], path[2], path[1]])).outcome).toBe("not_on_board");
    expect((await service.submit(code, authA, words[0], path)).outcome).toBe("accepted");
  });

  it("rejects bad credentials and lets players rejoin with their token", async () => {
    const { code, authA } = await setup();
    await expect(service.sync(code, { role: "host", token: "nope" })).rejects.toMatchObject({ code: "unauthorized" });
    if (authA.role !== "player") throw new Error();
    const again = await service.join(code, { nickname: "Whatever", playerId: authA.playerId, token: authA.token });
    expect(again.playerId).toBe(authA.playerId);
    expect(again.view.room.players).toHaveLength(2);
  });

  it("does not let a forged playerId hijack a seat", async () => {
    const { code, authA } = await setup();
    if (authA.role !== "player") throw new Error();
    const intruder = await service.join(code, { nickname: "Eve", playerId: authA.playerId, token: "wrong" });
    expect(intruder.playerId).not.toBe(authA.playerId);
    expect(intruder.view.room.players).toHaveLength(3);
  });

  it("kicks players and only lets the host or VIP control the room", async () => {
    const { code, host, authA, authB } = await setup();
    await expect(service.act(code, authA, { type: "start" })).rejects.toMatchObject({ code: "forbidden" });
    if (authB.role !== "player") throw new Error();
    await service.act(code, host, { type: "kick", playerId: authB.playerId });
    await expect(service.sync(code, authB)).rejects.toMatchObject({ code: "kicked" });
  });

  it("hands control to a player when the host disappears", async () => {
    const { code, authA } = await setup();
    now += HOST_TIMEOUT_MS;
    const view = (await service.sync(code, authA)) as PlayerView;
    expect(view.room.hostConnected).toBe(false);
    expect(view.me.isVip).toBe(true);
    const updated = await service.act(code, authA, { type: "settings", settings: { rounds: 5 } });
    expect(updated!.room.settings.rounds).toBe(5);
  });

  it("gives one hint per round", async () => {
    const { code, host, authA } = await setup();
    await service.act(code, host, { type: "start" });
    await boardWords(code);
    now += COUNTDOWN_MS;
    const { hint, hintsLeft } = await service.hint(code, authA);
    expect(hint).not.toBeNull();
    expect(hintsLeft).toBe(0);
    await expect(service.hint(code, authA)).rejects.toMatchObject({ code: "no_hints" });
  });

  it("closes rooms on request", async () => {
    const { code, host } = await setup();
    await service.act(code, host, { type: "close" });
    expect(events.at(-1)).toEqual({ type: "closed" });
    await expect(service.sync(code, host)).rejects.toMatchObject({ code: "room_not_found" });
  });
});
