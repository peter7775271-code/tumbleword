export const roomTopic = (code: string) => `room:${code}`;

/**
 * Events sent on a room's broadcast channel. They never carry game secrets:
 * `sync` tells clients to refetch state, `progress` carries word counts only.
 */
export type RealtimeEvent =
  | { type: "sync"; version: number }
  | { type: "progress"; playerId: string; count: number }
  | { type: "closed" };

export interface PresenceMeta {
  role: "host" | "player";
  playerId?: string;
}
