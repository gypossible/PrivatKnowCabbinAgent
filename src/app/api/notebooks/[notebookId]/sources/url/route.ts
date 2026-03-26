import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { withRouteErrorHandling } from "@/lib/api-route";
import { extractTextFromUrl } from "@/lib/extract-url";
import { ingestPlainText } from "@/lib/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ notebookId: string }> };

export const POST = withRouteErrorHandling(async function POST(
  req: Request,
  ctx: RouteContext,
) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);

  const body = (await req.json()) as { url?: string };
  const url = body.url?.trim();
  
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Only allow http/https
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Only http and https URLs are supported" },
      { status: 400 }
    );
  }

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .insert({
      notebook_id: notebookId,
      user_id: user.id,
      type: "url",
      title: url,
      canonical_url: url,
      status: "processing",
    })
    .select("id")
    .single();

  if (srcErr || !source) {
    return NextResponse.json(
      { error: srcErr?.message ?? "insert failed" },
      { status: 500 }
    );
  }

  const sourceId = source.id;

  try {
    const extracted = await extractTextFromUrl(url);
    const { chunkCount } = await ingestPlainText({
      supabase,
      notebookId,
      sourceId,
      userId: user.id,
      text: extracted.text,
    });

    await supabase
      .from("sources")
      .update({
        title: extracted.title.slice(0, 500),
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);

    return NextResponse.json({ sourceId, chunkCount, url });
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
});
