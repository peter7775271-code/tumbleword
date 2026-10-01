import type { Room, Submission } from "@/lib/game/types";

export interface StoredRoom {
  room: Room;
  version: number;
}

export type AddSubmissionResult = { status: "added"; count: number } | { status: "duplicate"; count: number };

/**
 * Persistence for rooms. Rooms are written with optimistic concurrency:
 * `updateRoom` only succeeds if the stored version still matches.
 */
export interface RoomStore {
  getRoom(code: string): Promise<StoredRoom | null>;
  /** Returns false if the code is already taken. */
  createRoom(room: Room): Promise<boolean>;
  /** Returns the new version, or null when another writer got there first. */
  updateRoom(room: Room, expectedVersion: number): Promise<number | null>;
  deleteRoom(code: string): Promise<void>;
  /** Adds a word for a player; reports duplicates and the player's word count this round. */
  addSubmission(code: string, submission: Submission): Promise<AddSubmissionResult>;
  listSubmissions(code: string, round: number): Promise<Submission[]>;
  countSubmissions(code: string, round: number): Promise<Record<string, number>>;
  /** Deletes rooms not updated since `before` (epoch ms). Returns how many were removed. */
  deleteInactiveRooms(before: number): Promise<number>;
}
