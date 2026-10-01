import type { SupabaseClient } from "@supabase/supabase-js";
import type { Room, Submission } from "@/lib/game/types";
import type { AddSubmissionResult, RoomStore, StoredRoom } from "./types";

const UNIQUE_VIOLATION = "23505";

/** Postgres-backed store (see supabase/migrations). Uses the service-role client, so RLS is bypassed. */
export class SupabaseRoomStore implements RoomStore {
  constructor(private db: SupabaseClient) {}

  async getRoom(code: string): Promise<StoredRoom | null> {
    const { data, error } = await this.db.from("rooms").select("state, version").eq("code", code).maybeSingle();
    if (error) throw error;
    return data ? { room: data.state as Room, version: data.version as number } : null;
  }

  async createRoom(room: Room): Promise<boolean> {
    const { error } = await this.db.from("rooms").insert({ code: room.code, state: room, version: 1 });
    if (error?.code === UNIQUE_VIOLATION) return false;
    if (error) throw error;
    return true;
  }

  async updateRoom(room: Room, expectedVersion: number): Promise<number | null> {
    const { data, error } = await this.db
      .from("rooms")
      .update({ state: room, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq("code", room.code)
      .eq("version", expectedVersion)
      .select("version");
    if (error) throw error;
    return data.length > 0 ? (data[0].version as number) : null;
  }

  async deleteRoom(code: string): Promise<void> {
    const { error } = await this.db.from("rooms").delete().eq("code", code);
    if (error) throw error;
  }

  async addSubmission(code: string, s: Submission): Promise<AddSubmissionResult> {
    const { error } = await this.db.from("submissions").insert({
      room_code: code,
      round: s.round,
      player_id: s.playerId,
      word: s.word,
      submitted_at: new Date(s.submittedAt).toISOString(),
    });
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
    const { count, error: countError } = await this.db
      .from("submissions")
      .select("word", { count: "exact", head: true })
      .eq("room_code", code)
      .eq("round", s.round)
      .eq("player_id", s.playerId);
    if (countError) throw countError;
    return { status: error ? "duplicate" : "added", count: count ?? 0 };
  }

  async listSubmissions(code: string, round: number): Promise<Submission[]> {
    const { data, error } = await this.db
      .from("submissions")
      .select("player_id, word, submitted_at")
      .eq("room_code", code)
      .eq("round", round)
      .limit(10_000);
    if (error) throw error;
    return data.map((r) => ({
      round,
      playerId: r.player_id as string,
      word: r.word as string,
      submittedAt: Date.parse(r.submitted_at as string),
    }));
  }

  async countSubmissions(code: string, round: number): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const s of await this.listSubmissions(code, round)) counts[s.playerId] = (counts[s.playerId] ?? 0) + 1;
    return counts;
  }

  async deleteInactiveRooms(before: number): Promise<number> {
    const { data, error } = await this.db
      .from("rooms")
      .delete()
      .lt("updated_at", new Date(before).toISOString())
      .select("code");
    if (error) throw error;
    return data.length;
  }
}
