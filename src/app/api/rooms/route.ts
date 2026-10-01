import { route } from "@/lib/server/http";
import { getRoomService } from "@/lib/server/service";

export const POST = route(() => getRoomService().createRoom());
