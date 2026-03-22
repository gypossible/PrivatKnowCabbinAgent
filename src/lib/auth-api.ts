import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

export async function assertNotebookAccess(
  supabase: SupabaseClient,
  notebookId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("notebooks")
    .select("id")
    .eq("id", notebookId)
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Response(JSON.stringify({ error: "Notebook not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
