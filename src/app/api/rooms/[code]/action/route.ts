import { GameError } from "@/lib/game/state-machine";
import type { Settings } from "@/lib/game/types";
import type { RoomAction } from "@/lib/shared/api";
import { parseAuth, route, str } from "@/lib/server/http";
import { getRoomService } from "@/lib/server/service";

function parseAction(value: unknown): RoomAction {
  const v = (value ?? {}) as Record<string, unknown>;
  switch (v.type) {
    case "start":
    case "next":
    case "playAgain":
    case "leave":
    case "close":
      return { type: v.type };
    case "kick":
      return { type: "kick", playerId: str(v.playerId, "playerId", 64) };
    case "settings": {
      const s = (v.settings ?? {}) as Record<string, unknown>;
      const settings: Partial<Settings> = {};
      if (typeof s.rounds === "number") settings.rounds = s.rounds;
      if (typeof s.roundSeconds === "number") settings.roundSeconds = s.roundSeconds;
      if (typeof s.minWords === "number") settings.minWords = s.minWords;
      if (typeof s.hints === "boolean") settings.hints = s.hints;
      return { type: "settings", settings };
    }
    default:
      throw new GameError("bad_request", "Unknown action");
  }
}

export const POST = route(({ code, body }) => getRoomService().act(code, parseAuth(body.auth), parseAction(body.action)));
