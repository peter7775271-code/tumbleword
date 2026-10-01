import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";

/** No vowels, so codes never spell words. */
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 4;

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export const newPlayerId = () => randomUUID();
export const newToken = () => randomBytes(24).toString("base64url");
