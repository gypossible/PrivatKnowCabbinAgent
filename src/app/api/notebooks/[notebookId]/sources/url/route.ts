import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { extractTextFromUrl } from "@/lib/extract";
import { ingestPlainText } from "@/lib/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ notebookId: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);

  const body = (await req.json()) as { url?: string };
  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "only http(s) URLs" }, { status: 400 });
  }

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .insert({
      notebook_id: notebookId,
      user_id: user.id,
      type: "url",
      title: url,
      canonical_url: parsed.toString(),
      status: "processing",
    })
    .select("id")
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: srcErr?.message ?? "insert failed" }, { status: 500 });
  }

  const sourceId = source.id;

  try {
    const { title, text } = await extractTextFromUrl(parsed.toString());
    await supabase
      .from("sources")
      .update({
        title: title.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);

    const { chunkCount } = await ingestPlainText({
      supabase,
      notebookId,
      sourceId,
      userId: user.id,
      text,
    });

    await supabase
      .from("sources")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", sourceId);

    return NextResponse.json({ sourceId, chunkCount, title });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    await supabase
      .from("sources")
      .update({
        status: "failed",
        error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
