import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ notebookId: string }> };

export async function GET(req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);

  const { data: session, error: sErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("notebook_id", notebookId)
    .eq("user_id", user.id)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,role,content,metadata,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}
