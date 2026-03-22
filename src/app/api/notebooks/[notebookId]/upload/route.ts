import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { extractTextFromBuffer } from "@/lib/extract-file";
import { ingestPlainText } from "@/lib/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ notebookId: string }> };

export async function POST(req: Request, ctx: RouteContext) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const filename = file.name || "upload";

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .insert({
      notebook_id: notebookId,
      user_id: user.id,
      type: "upload",
      title: filename,
      status: "processing",
    })
    .select("id")
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: srcErr?.message ?? "insert failed" }, { status: 500 });
  }

  const sourceId = source.id;
  const safeName = filename.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  const storagePath = `${user.id}/${notebookId}/${sourceId}/${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("sources")
    .upload(storagePath, buffer, { contentType: mime, upsert: true });

  if (upErr) {
    await supabase
      .from("sources")
      .update({
        status: "failed",
        error_message: upErr.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await supabase
    .from("sources")
    .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq("id", sourceId);

  try {
    const text = await extractTextFromBuffer(buffer, mime, filename);
    const { chunkCount } = await ingestPlainText({
      supabase,
      notebookId,
      sourceId,
      userId: user.id,
      text,
    });
    await supabase
      .from("sources")
      .update({
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);
    return NextResponse.json({ sourceId, chunkCount, storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "extract failed";
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
