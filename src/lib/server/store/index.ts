import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
    } else {
      if (process.env.VERCEL) {
        console.warn("[tumbleword] Supabase env vars missing: using the in-memory store, which breaks across serverless instances.");
      }
      g.__tumblewordStore = new MemoryRoomStore();
    }
  }
  return g.__tumblewordStore;
}

export type { RoomStore } from "./types";
