import { timingSafeEqual } from "node:crypto";
import { HEARTBEAT_WRITE_MS, HINTS_PER_ROUND, MIN_WORD_LENGTH, ROOM_INACTIVE_MS, SUBMIT_GRACE_MS } from "@/lib/game/constants";
import { awardCard, playCard, resolveHeist } from "@/lib/game/cards";
import { generateBoard, type GeneratedBoard } from "@/lib/game/generator";
import { scoreWord } from "@/lib/game/scoring";
import { findPath, pathSpells } from "@/lib/game/solver";
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
  type Actor,
} from "@/lib/game/state-machine";
import type { Trie } from "@/lib/game/trie";
import type { Room, ServerPlayer } from "@/lib/game/types";
import type {
  Auth,
  CreateRoomResponse,
  Hint,
  HintResponse,
  JoinRequest,
  JoinResponse,
  RoomAction,
  RoomView,
  SubmitResponse,
} from "@/lib/shared/api";
import type { RealtimeEvent } from "@/lib/shared/realtime";
import type { RoomStore } from "./store/types";
import { hostView, playerView, publicSignature, toPublicRoom } from "./views";

export interface RoomServiceDeps {
  store: RoomStore;
  dictionary: () => Promise<Trie>;
  broadcast: (code: string, event: RealtimeEvent) => Promise<void>;
  newRoomCode: () => string;
  newPlayerId: () => string;
  newToken: () => string;
  now?: () => number;
}

const MAX_WRITE_RETRIES = 8;

function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createRoomService(deps: RoomServiceDeps) {
  const { store } = deps;
  const clock = deps.now ?? Date.now;

  async function load(code: string) {
    const stored = await store.getRoom(code);
    if (!stored) throw new GameError("room_not_found", "Room not found. Check the code?", 404);
    return stored;
  }

  function authenticate(room: Room, auth: Auth): { actor: Actor; player: ServerPlayer | null } {
    if (auth.role === "host") {
      if (!tokensMatch(auth.token, room.hostToken)) throw new GameError("unauthorized", "Not the host of this room", 403);
      return { actor: { kind: "host" }, player: null };
    }
    const player = room.players.find((p) => p.id === auth.playerId);
    if (!player) {
      if (room.kickedIds.includes(auth.playerId)) throw new GameError("kicked", "You were removed from this room", 403);
      throw new GameError("not_in_room", "You are not in this room", 404);
    }
    if (!tokensMatch(auth.token, player.token)) throw new GameError("unauthorized", "Session expired, please rejoin", 403);
    return { actor: { kind: "player", playerId: player.id }, player };
  }

  /** Applies time-driven transitions (countdown end, round end + scoring). */
  async function tick(room: Room, now: number): Promise<void> {
    advanceTime(room, now);
    if (isRoundOver(room, now)) {
      finishRound(room, await store.listSubmissions(room.code, room.round!.number));
      resolveHeist(room);
    }
  }

  async function newBoard(room: Room): Promise<GeneratedBoard> {
    return generateBoard(await deps.dictionary(), { minWords: room.settings.minWords });
  }

  /**
   * Load, tick, apply `fn`, and write back with optimistic concurrency, retrying on conflicts.
   * Broadcasts a sync event when anything clients can see has changed.
   */
  async function mutate<T>(code: string, fn: (room: Room, now: number) => Promise<T> | T) {
    for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
      const { room, version } = await load(code);
      const now = clock();
      const before = JSON.stringify(room);
      const signature = publicSignature(room, now);
      await tick(room, now);
      const result = await fn(room, now);
      if (JSON.stringify(room) === before) return { room, version, result, now };
      const newVersion = await store.updateRoom(room, version);
      if (newVersion === null) continue;
      if (publicSignature(room, now) !== signature) await deps.broadcast(code, { type: "sync", version: newVersion });
      return { room, version: newVersion, result, now };
    }
    throw new GameError("busy", "The room is busy, try again", 503);
  }

  async function buildView(room: Room, version: number, auth: Auth, now: number): Promise<RoomView> {
    const roundNumber = room.round?.number;
    const counts = roundNumber ? await store.countSubmissions(room.code, roundNumber) : {};
    const pub = toPublicRoom(room, version, counts, now);
    if (auth.role === "host") return hostView(pub);
    const player = room.players.find((p) => p.id === auth.playerId)!;
    let myWords: string[] = [];
    if (roundNumber && (pub.phase === "ROUND" || pub.phase === "COUNTDOWN")) {
      myWords = (await store.listSubmissions(room.code, roundNumber))
        .filter((s) => s.playerId === player.id)
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .map((s) => s.word);
    }
    return playerView(room, pub, player, myWords);
  }

  return {
    async createRoom(): Promise<CreateRoomResponse> {
      const now = clock();
      await store.deleteInactiveRooms(now - ROOM_INACTIVE_MS).catch((err) => console.warn("[tumbleword] cleanup failed", err));
      const hostToken = deps.newToken();
      for (let attempt = 0; attempt < 20; attempt++) {
        const room = createRoom(deps.newRoomCode(), hostToken, now);
        if (await store.createRoom(room)) {
          const view = (await buildView(room, 1, { role: "host", token: hostToken }, now)) as CreateRoomResponse["view"];
          return { code: room.code, hostToken, view };
        }
      }
      throw new GameError("no_codes", "Could not allocate a room code", 503);
    },

    /** Heartbeat + state fetch. Also drives time-based transitions. */
    async sync(code: string, auth: Auth): Promise<RoomView> {
      const { room, version, now } = await mutate(code, (room, now) => {
        const { player } = authenticate(room, auth);
        if (player && now - player.lastSeenAt >= HEARTBEAT_WRITE_MS) player.lastSeenAt = now;
        if (!player && now - room.hostLastSeenAt >= HEARTBEAT_WRITE_MS) room.hostLastSeenAt = now;
      });
      return buildView(room, version, auth, now);
    },

    async join(code: string, req: JoinRequest): Promise<JoinResponse> {
      const { room, version, now, result } = await mutate(code, (room, now) => {
        if (req.playerId && req.token) {
          const existing = room.players.find((p) => p.id === req.playerId);
          if (existing && tokensMatch(req.token, existing.token)) {
            existing.lastSeenAt = now;
            return { playerId: existing.id, token: existing.token };
          }
        }
        const token = deps.newToken();
        const idTaken = room.players.some((p) => p.id === req.playerId);
        const id = req.playerId && !idTaken ? req.playerId : deps.newPlayerId();
        const { player } = addPlayer(room, { id, token, nickname: req.nickname, emoji: req.emoji }, now);
        return { playerId: player.id, token };
      });
      const view = (await buildView(room, version, { role: "player", ...result }, now)) as JoinResponse["view"];
      return { ...result, view };
    },

    async act(code: string, auth: Auth, action: RoomAction): Promise<RoomView | null> {
      if (action.type === "close") {
        const { room } = await load(code);
        if (authenticate(room, auth).actor.kind !== "host") throw new GameError("forbidden", "Only the host can close the room", 403);
        await store.deleteRoom(code);
        await deps.broadcast(code, { type: "closed" });
        return null;
      }

      // Boards are generated outside the write loop so retries don't re-roll them.
      let board: GeneratedBoard | null = null;
      if (action.type === "start" || action.type === "next") {
        const { room } = await load(code);
        board = await newBoard(room);
      }

      const { room, version, now } = await mutate(code, (room, now) => {
        const { actor, player } = authenticate(room, auth);
        if (action.type === "leave") {
          if (!player) throw new GameError("forbidden", "Only players can leave", 403);
          removePlayer(room, player.id, false);
          return;
        }
        if (action.type === "playCard") {
          if (!player) throw new GameError("forbidden", "Only players can play cards", 403);
          const result = playCard(room, player.id, action.cardId, action.targetId ?? null, now);
          if (!result.ok) throw new GameError("card_failed", result.reason ?? "Card could not be played", 400);
          return result;
        }
        if (!canControl(room, actor, now)) throw new GameError("forbidden", "Only the host can do that", 403);
        switch (action.type) {
          case "start":
            startGame(room, board!, now);
            for (const p of room.players) {
              p.hand = [];
              p.lastCardEarnedAt = 0;
              p.lastCardPlayedAt = 0;
              p.personalDeadlineOffset = 0;
            }
            break;
          case "next":
            advanceFromReveal(room, hasNextRound(room) ? board : null, now);
            break;
          case "playAgain":
            playAgain(room);
            break;
          case "settings":
            updateSettings(room, action.settings);
            break;
          case "kick":
            removePlayer(room, action.playerId, true);
            break;
        }
      });
      if (action.type === "leave") return null;
      return buildView(room, version, auth, now);
    },

    async submit(code: string, auth: Auth, rawWord: string, path: number[] | null): Promise<SubmitResponse> {
      const now = clock();
      let { room } = await load(code);
      if (isRoundOver(room, now)) room = (await mutate(code, () => undefined)).room;
      const { player } = authenticate(room, auth);
      if (!player) throw new GameError("forbidden", "Only players can submit words", 403);

      const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
      const reply = (outcome: SubmitResponse["outcome"], count = 0, points = 0): SubmitResponse => ({ outcome, word, points, count });
      const phase = effectivePhase(room, now);
      const round = room.round;

      if (phase === "COUNTDOWN") return reply("not_started");
      if (phase !== "ROUND" || !round || now > round.endsAt + SUBMIT_GRACE_MS) return reply("round_over");
      if (player.status !== "active") return reply("not_playing");
      if (word.length < MIN_WORD_LENGTH) return reply("too_short");
      const onBoard = path ? pathSpells(round.board, path, word) : findPath(round.board, word) !== null;
      if (!onBoard) return reply("not_on_board");
      if (!(await deps.dictionary()).has(word)) return reply("not_a_word");

      const effectiveDeadline = round.endsAt - player.personalDeadlineOffset;
      if (now > effectiveDeadline + SUBMIT_GRACE_MS) return reply("round_over");

      const added = await store.addSubmission(code, { round: round.number, playerId: player.id, word, submittedAt: now });
      if (added.status === "duplicate") return reply("duplicate", added.count);
      await deps.broadcast(code, { type: "progress", playerId: player.id, count: added.count });

      const points = scoreWord(word);
      if (word.length >= room.settings.cardMinLength && room.settings.sabotageEnabled) {
        await mutate(code, (room, now) => {
          const reward = awardCard(room, player.id, word, now);
          return reward;
        });
      }
      return reply("accepted", added.count, points);
    },

    async hint(code: string, auth: Auth): Promise<HintResponse> {
      const preliminary = await load(code);
      const roundNumber = preliminary.room.round?.number ?? 0;
      const submissions = roundNumber ? await store.listSubmissions(code, roundNumber) : [];

      const { result } = await mutate(code, (room, now) => {
        const { player } = authenticate(room, auth);
        if (!player) throw new GameError("forbidden", "Only players can ask for hints", 403);
        const round = room.round;
        if (!room.settings.hints) throw new GameError("hints_off", "Hints are turned off");
        if (effectivePhase(room, now) !== "ROUND" || !round || round.number !== roundNumber) {
          throw new GameError("wrong_phase", "Hints are only available during a round", 409);
        }
        const used = round.hintsUsed[player.id] ?? 0;
        if (used >= HINTS_PER_ROUND) throw new GameError("no_hints", "No hints left this round");

        const mine = new Set(submissions.filter((s) => s.playerId === player.id).map((s) => s.word));
        const candidates = round.solution.filter((w) => !mine.has(w));
        const preferred = candidates.filter((w) => w.length >= 5 && w.length <= 7);
        const pool = preferred.length > 0 ? preferred : candidates;
        if (pool.length === 0) return { hint: null, hintsLeft: HINTS_PER_ROUND - used };

        const word = pool[Math.floor(Math.random() * pool.length)];
        round.hintsUsed[player.id] = used + 1;
        const hint: Hint = { start: findPath(round.board, word)![0], length: word.length };
        return { hint, hintsLeft: HINTS_PER_ROUND - used - 1 };
      });
      return result;
    },

    async cleanup(): Promise<number> {
      return store.deleteInactiveRooms(clock() - ROOM_INACTIVE_MS);
    },
  };
}

export type RoomService = ReturnType<typeof createRoomService>;
