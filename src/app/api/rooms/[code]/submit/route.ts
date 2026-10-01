import { parseAuth, parsePath, route, str } from "@/lib/server/http";
import { getRoomService } from "@/lib/server/service";

export const POST = route(({ code, body }) =>
  getRoomService().submit(code, parseAuth(body.auth), str(body.word, "word", 32), parsePath(body.path)),
);
