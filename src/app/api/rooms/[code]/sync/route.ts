import { parseAuth, route } from "@/lib/server/http";
import { getRoomService } from "@/lib/server/service";

export const POST = route(({ code, body }) => getRoomService().sync(code, parseAuth(body.auth)));
