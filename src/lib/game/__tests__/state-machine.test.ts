import { describe, expect, it } from "vitest";
import { boardFromRows } from "../board";
import { COUNTDOWN_MS, HOST_TIMEOUT_MS, MAX_PLAYERS, PLAYER_TIMEOUT_MS, ROUND_SETTLE_MS } from "../constants";
import type { GeneratedBoard } from "../generator";
import {
  GameError,
  addPlayer,
  advanceFromReveal,
  advanceTime,
  canControl,
  createRoom,
  effectivePhase,
  finishRound,
  hasNextRound,
  isRoundOver,
  playAgain,
  removePlayer,
  startGame,
  updateSettings,
  vipId,
} from "../state-machine";
import type { Room } from "../types";

const gen: GeneratedBoard = {
  board: boardFromRows(["CATS", "ZZZZ", "ZZZZ", "ZZZZ"]),
  solution: ["cats", "cat"],
  attempts: 1,
};

function lobby(players = 2, now = 0): Room {
  const room = createRoom("ABCD", "host-token", now);
  for (let i = 0; i < players; i++) addPlayer(room, { id: `p${i}`, token: `t${i}`, nickname: `Player ${i}` }, now);
  return room;
}

function expectGameError(fn: () => void, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

describe("joining", () => {
  it("assigns distinct colors and emojis", () => {
    const room = lobby(MAX_PLAYERS);
    expect(new Set(room.players.map((p) => p.color)).size).toBe(MAX_PLAYERS);
    expect(new Set(room.players.map((p) => p.emoji)).size).toBe(MAX_PLAYERS);
  });

  it("rejects joins beyond the player cap", () => {
    const room = lobby(MAX_PLAYERS);
    expectGameError(() => addPlayer(room, { id: "x", token: "x", nickname: "Extra" }, 0), "room_full");
  });

  it("rejects a name held by a connected player", () => {
    const room = lobby(1);
    expectGameError(() => addPlayer(room, { id: "x", token: "x", nickname: "player 0" }, 1000), "name_taken");
  });

  it("lets a disconnected player reclaim their seat by nickname", () => {
    const room = lobby(1);
    room.players[0].score = 7;
    const { player, reclaimed } = addPlayer(room, { id: "new", token: "new-token", nickname: "Player 0" }, PLAYER_TIMEOUT_MS + 1);
    expect(reclaimed).toBe(true);
    expect(player.id).toBe("p0");
    expect(player.token).toBe("new-token");
    expect(player.score).toBe(7);
    expect(room.players).toHaveLength(1);
  });

  it("makes late joiners spectate until the next round", () => {
    const room = lobby(2);
    startGame(room, gen, 0);
    const { player } = addPlayer(room, { id: "late", token: "late", nickname: "Late" }, 100);
    expect(player.status).toBe("spectating");
    room.phase = "ROUND";
    finishRound(room, [{ round: 1, playerId: "late", word: "cats", submittedAt: 0 }]);
    expect(room.history[0].players.late).toBeUndefined();
    advanceFromReveal(room, gen, 200);
    expect(room.players.find((p) => p.id === "late")!.status).toBe("active");
  });

  it("blocks kicked players from rejoining", () => {
    const room = lobby(2);
    removePlayer(room, "p1", true);
    expect(room.players).toHaveLength(1);
    expectGameError(() => addPlayer(room, { id: "p1", token: "t", nickname: "Again" }, 0), "kicked");
  });
});

describe("settings", () => {
  it("clamps values to their limits and steps", () => {
    const room = lobby();
    updateSettings(room, { rounds: 99, roundSeconds: 100, minWords: -5, hints: false });
    expect(room.settings).toEqual({ rounds: 10, roundSeconds: 90, minWords: 0, hints: false });
  });

  it("cannot change mid-game", () => {
    const room = lobby();
    startGame(room, gen, 0);
    expectGameError(() => updateSettings(room, { rounds: 2 }), "wrong_phase");
  });
});

describe("round lifecycle", () => {
  it("needs at least two players to start", () => {
    expectGameError(() => startGame(lobby(1), gen, 0), "not_enough_players");
  });

  it("runs LOBBY -> COUNTDOWN -> ROUND -> REVEAL -> ... -> FINAL -> LOBBY", () => {
    const room = lobby(2);
    updateSettings(room, { rounds: 2, roundSeconds: 60 });

    startGame(room, gen, 1_000);
    expect(room.phase).toBe("COUNTDOWN");
    expect(room.round!.startsAt).toBe(1_000 + COUNTDOWN_MS);
    expect(room.round!.endsAt).toBe(1_000 + COUNTDOWN_MS + 60_000);

    expect(advanceTime(room, 1_000 + COUNTDOWN_MS - 1)).toBe(false);
    expect(effectivePhase(room, 1_000 + COUNTDOWN_MS)).toBe("ROUND");
    expect(advanceTime(room, 1_000 + COUNTDOWN_MS)).toBe(true);
    expect(room.phase).toBe("ROUND");

    const end = room.round!.endsAt;
    expect(isRoundOver(room, end)).toBe(false);
    expect(isRoundOver(room, end + ROUND_SETTLE_MS)).toBe(true);

    finishRound(room, [
      { round: 1, playerId: "p0", word: "cats", submittedAt: 0 },
      { round: 1, playerId: "p1", word: "cat", submittedAt: 0 },
    ]);
    expect(room.phase).toBe("REVEAL");
    expect(room.players.map((p) => p.score)).toEqual([1 + 3, 1]);
    expect(hasNextRound(room)).toBe(true);

    advanceFromReveal(room, gen, end + 10_000);
    expect(room.phase).toBe("COUNTDOWN");
    expect(room.round!.number).toBe(2);

    room.phase = "ROUND";
    finishRound(room, []);
    expect(hasNextRound(room)).toBe(false);
    advanceFromReveal(room, null, 0);
    expect(room.phase).toBe("FINAL");
    expect(room.history).toHaveLength(2);

    playAgain(room);
    expect(room.phase).toBe("LOBBY");
    expect(room.history).toEqual([]);
    expect(room.players.every((p) => p.score === 0)).toBe(true);
  });

  it("rejects out-of-order transitions", () => {
    const room = lobby(2);
    expectGameError(() => advanceFromReveal(room, gen, 0), "wrong_phase");
    expectGameError(() => playAgain(room), "wrong_phase");
    startGame(room, gen, 0);
    expectGameError(() => startGame(room, gen, 0), "wrong_phase");
  });
});

describe("host disconnect", () => {
  it("promotes the earliest connected player when the host goes quiet", () => {
    const room = lobby(3);
    const later = HOST_TIMEOUT_MS + 1;
    expect(vipId(room, 0)).toBeNull();
    room.players[0].lastSeenAt = -PLAYER_TIMEOUT_MS; // p0 is gone too
    room.players[1].lastSeenAt = later;
    room.players[2].lastSeenAt = later;
    expect(vipId(room, later)).toBe("p1");
    expect(canControl(room, { kind: "player", playerId: "p1" }, later)).toBe(true);
    expect(canControl(room, { kind: "player", playerId: "p2" }, later)).toBe(false);
  });

  it("returns control to the host when it reconnects", () => {
    const room = lobby(2);
    const later = HOST_TIMEOUT_MS + 1;
    room.players.forEach((p) => (p.lastSeenAt = later));
    expect(vipId(room, later)).toBe("p0");
    room.hostLastSeenAt = later;
    expect(vipId(room, later)).toBeNull();
    expect(canControl(room, { kind: "host" }, later)).toBe(true);
  });
});
