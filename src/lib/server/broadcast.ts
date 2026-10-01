import "server-only";
import { roomTopic, type RealtimeEvent } from "@/lib/shared/realtime";
import { getSupabaseAdmin } from "./store";

/**
 * Notifies everyone in a room over Supabase Realtime Broadcast (REST, no socket needed).
 * Payloads only carry a version or counts; clients fetch the authoritative state from the API,
 * so a spoofed broadcast can at most trigger an extra fetch.
 */
export async function broadcast(code: string, event: RealtimeEvent): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const channel = admin.channel(roomTopic(code));
  try {
    const res = await channel.httpSend(event.type, event, { timeout: 2_000 });
    if (!res.success) console.warn(`[tumbleword] broadcast failed (${res.status}): ${res.error}`);
  } catch (err) {
    console.warn("[tumbleword] broadcast error", err);
  } finally {
    await admin.removeChannel(channel);
  }
}
