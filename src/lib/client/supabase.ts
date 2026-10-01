import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Browser client for Realtime only (publishable/anon key). Null when Supabase isn't configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return client;
}
