import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "./env";

export function getBrowserSupabase() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}

