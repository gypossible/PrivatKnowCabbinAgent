import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ notebookId: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);
  const { data, error } = await supabase
    .from("sources")
    .select("id,type,title,canonical_url,status,error_message,created_at")
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sources: data ?? [] });
}
