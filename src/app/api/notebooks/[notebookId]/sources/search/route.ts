import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { withRouteErrorHandling } from "@/lib/api-route";
import { extractTextFromUrl } from "@/lib/extract-url";
import { ingestPlainText } from "@/lib/ingest";
import { tavilySearch } from "@/lib/tavily";
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

  const body = (await req.json()) as { query?: string; maxResults?: number };
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }
  const maxResults = Math.min(Math.max(body.maxResults ?? 4, 1), 8);

  let results;
  try {
    results = await tavilySearch(query, maxResults);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ingested: {
    sourceId: string;
    url: string;
    title: string;
    chunkCount: number;
    status: string;
    error?: string;
  }[] = [];

  for (const r of results) {
    if (!r.url) continue;

    const { data: source, error: srcErr } = await supabase
      .from("sources")
      .insert({
        notebook_id: notebookId,
        user_id: user.id,
        type: "search",
        title: r.title || r.url,
        canonical_url: r.url,
        status: "processing",
      })
      .select("id")
      .single();

    if (srcErr || !source) {
      ingested.push({
        sourceId: "",
        url: r.url,
        title: r.title,
        chunkCount: 0,
        status: "failed",
        error: srcErr?.message,
      });
      continue;
    }

    const sourceId = source.id;
    let text = "";
    let pageTitle = r.title || r.url;

    try {
      const extracted = await extractTextFromUrl(r.url);
      text = extracted.text;
      pageTitle = extracted.title;
    } catch {
      text = r.content ?? "";
    }

    if (!text.trim()) {
      await supabase
        .from("sources")
        .update({
          status: "failed",
          error_message: "No text extracted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId);
      ingested.push({
        sourceId,
        url: r.url,
        title: pageTitle,
        chunkCount: 0,
        status: "failed",
        error: "No text extracted",
      });
      continue;
    }

    await supabase
      .from("sources")
      .update({
        title: pageTitle.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);

    try {
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
      ingested.push({
        sourceId,
        url: r.url,
        title: pageTitle,
        chunkCount,
        status: "ready",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ingest failed";
      await supabase
        .from("sources")
        .update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId);
      ingested.push({
        sourceId,
        url: r.url,
        title: pageTitle,
        chunkCount: 0,
        status: "failed",
        error: msg,
      });
    }
  }

  return NextResponse.json({ results: ingested });
});
