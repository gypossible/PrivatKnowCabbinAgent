/**
 * Supabase URL + browser-safe anon key.
 * Vercel Marketplace may set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY instead of ANON_KEY.
 */
export const SUPABASE_PUBLIC_ENV_SETUP_MESSAGE =
  "Supabase is not configured for this deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or reconnect the Supabase Vercel integration so NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is injected, then redeploy.";

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    undefined
  );
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getSupabasePublicEnvIssue(): string | null {
  return hasSupabasePublicEnv() ? null : SUPABASE_PUBLIC_ENV_SETUP_MESSAGE;
}
