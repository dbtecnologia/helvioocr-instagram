import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isServerSupabaseConfigured, isSupabaseConfigured } from "./env";

export async function getServerSupabase() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookiesToSet) => { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* server component */ } } } });
}

export function getAdminSupabase() { if (!isServerSupabaseConfigured) return null; return createAdminClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }); }
