import "server-only";
import { broadcast } from "./broadcast";
import { getDictionary } from "./dictionary";
import { newPlayerId, newRoomCode, newToken } from "./ids";
import { createRoomService, type RoomService } from "./room-service";
import { getStore } from "./store";

let service: RoomService | null = null;

export function getRoomService(): RoomService {
  service ??= createRoomService({
    store: getStore(),
    dictionary: getDictionary,
    broadcast,
    newRoomCode,
    newPlayerId,
    newToken,
  });
  return service;
}
