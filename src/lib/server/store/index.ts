import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GameError } from "@/lib/game/state-machine";
import { supabaseServerEnv } from "../env";
import { MemoryRoomStore } from "./memory";
import { SupabaseRoomStore } from "./supabase";
import type { RoomStore } from "./types";

const g = globalThis as unknown as { __tumblewordStore?: RoomStore; __tumblewordAdmin?: SupabaseClient | null };

/** Service-role Supabase client, or null when Supabase is not configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (g.__tumblewordAdmin === undefined) {
    const env = supabaseServerEnv();
    g.__tumblewordAdmin = env
      ? createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  }
  return g.__tumblewordAdmin;
}

export function getStore(): RoomStore {
  if (!g.__tumblewordStore) {
    const admin = getSupabaseAdmin();
    if (admin) {
      g.__tumblewordStore = new SupabaseRoomStore(admin);
    } else if (process.env.VERCEL) {
      // Serverless instances don't share memory, so rooms would vanish between requests.
      throw new GameError(
        "not_configured",
        "Server not configured: set the Supabase environment variables (see README).",
        503,
      );
    } else {
      g.__tumblewordStore = new MemoryRoomStore();
    }
  }
  return g.__tumblewordStore;
}

export type { RoomStore } from "./types";
