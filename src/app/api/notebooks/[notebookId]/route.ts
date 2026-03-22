import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ notebookId: string }> };

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);
  const { error } = await supabase.from("notebooks").delete().eq("id", notebookId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);
  const body = (await req.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("notebooks")
    .update({ title: title.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", notebookId)
    .select("id,title,updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notebook: data });
}
