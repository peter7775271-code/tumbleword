import { optStr, route, str } from "@/lib/server/http";
import { getRoomService } from "@/lib/server/service";

export const POST = route(({ code, body }) =>
  getRoomService().join(code, {
    nickname: str(body.nickname, "nickname", 64),
    emoji: optStr(body.emoji, "emoji", 16),
    playerId: optStr(body.playerId, "playerId", 64),
    token: optStr(body.token, "token"),
  }),
);
