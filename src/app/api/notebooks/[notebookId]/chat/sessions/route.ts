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
    .from("chat_sessions")
    .select("id,title,created_at,updated_at")
    .eq("notebook_id", notebookId)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);
  let title: string | undefined;
  try {
    const b = await req.json();
    title = typeof b.title === "string" ? b.title.slice(0, 200) : undefined;
  } catch {
    /* optional body */
  }
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      notebook_id: notebookId,
      user_id: user.id,
      title: title ?? "Chat",
    })
    .select("id,title,created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ session: data });
}
