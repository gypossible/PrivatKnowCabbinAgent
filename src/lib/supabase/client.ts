import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabasePublicEnvIssue,
  getSupabaseUrl,
} from "@/lib/supabase/env";

export function createClient() {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    throw new Error(
      getSupabasePublicEnvIssue() ??
        "Missing Supabase URL or anon/publishable key in environment.",
    );
  }
  return createBrowserClient(url, anon);
}
