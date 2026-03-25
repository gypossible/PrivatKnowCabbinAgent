import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabaseAnonKey,
  getSupabasePublicEnvIssue,
  getSupabaseUrl,
} from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    throw new Error(
      getSupabasePublicEnvIssue() ??
        "Missing Supabase URL or anon/publishable key in environment.",
    );
  }

  return createServerClient(
    url,
    anon,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* ignore when called from Server Component */
          }
        },
      },
    },
  );
}
