import type { Room, Submission } from "@/lib/game/types";
import type { AddSubmissionResult, RoomStore, StoredRoom } from "./types";

interface Entry {
  json: string;
  version: number;
  updatedAt: number;
  submissions: Submission[];
}

/**
 * Single-process store for local development and tests. State lives in memory,
 * so it does not survive restarts or work across serverless instances.
 */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Entry>();

  async getRoom(code: string): Promise<StoredRoom | null> {
    const e = this.rooms.get(code);
    return e ? { room: JSON.parse(e.json) as Room, version: e.version } : null;
  }

  async createRoom(room: Room): Promise<boolean> {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, { json: JSON.stringify(room), version: 1, updatedAt: Date.now(), submissions: [] });
    return true;
  }

  async updateRoom(room: Room, expectedVersion: number): Promise<number | null> {
    const e = this.rooms.get(room.code);
    if (!e || e.version !== expectedVersion) return null;
    e.json = JSON.stringify(room);
    e.version += 1;
    e.updatedAt = Date.now();
    return e.version;
  }

  async deleteRoom(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async addSubmission(code: string, s: Submission): Promise<AddSubmissionResult> {
    const e = this.rooms.get(code);
    if (!e) throw new Error("Room not found");
    const mine = e.submissions.filter((x) => x.round === s.round && x.playerId === s.playerId);
    if (mine.some((x) => x.word === s.word)) return { status: "duplicate", count: mine.length };
    e.submissions.push(s);
    return { status: "added", count: mine.length + 1 };
  }

  async listSubmissions(code: string, round: number): Promise<Submission[]> {
    return (this.rooms.get(code)?.submissions ?? []).filter((s) => s.round === round);
  }

  async countSubmissions(code: string, round: number): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const s of await this.listSubmissions(code, round)) counts[s.playerId] = (counts[s.playerId] ?? 0) + 1;
    return counts;
  }

  async deleteInactiveRooms(before: number): Promise<number> {
    let removed = 0;
    for (const [code, e] of this.rooms) {
      if (e.updatedAt < before) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}
