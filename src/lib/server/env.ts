import "server-only";

export interface SupabaseServerEnv {
  url: string;
  serviceRoleKey: string;
}

/** Supabase credentials, or null to run with the in-memory store (local development only). */
export function supabaseServerEnv(): SupabaseServerEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}
