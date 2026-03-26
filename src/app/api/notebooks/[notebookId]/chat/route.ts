import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createClient } from "@/lib/supabase/server";
import { assertNotebookAccess, requireUser } from "@/lib/auth-api";
import { withRouteErrorHandling } from "@/lib/api-route";
import { embedTexts, getOpenAI } from "@/lib/openai-server";
import { tavilySearch } from "@/lib/tavily";
import { toVectorLiteral } from "@/lib/vector";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ notebookId: string }> };

type Citation = {
  index: number;
  chunkId: string;
  sourceId: string;
  excerpt: string;
};

export const POST = withRouteErrorHandling(async function POST(
  req: Request,
  ctx: RouteContext,
) {
  const { notebookId } = await ctx.params;
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await assertNotebookAccess(supabase, notebookId, user.id);

  const body = (await req.json()) as {
    sessionId?: string | null;
    message?: string;
    generateImage?: boolean;
    allowWeb?: boolean;
  };
  const message = body.message?.trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sessionId = body.sessionId ?? null;
  if (!sessionId) {
    const { data: sess, error: se } = await supabase
      .from("chat_sessions")
      .insert({
        notebook_id: notebookId,
        user_id: user.id,
        title: message.slice(0, 80),
      })
      .select("id")
      .single();
    if (se || !sess) {
      return new Response(JSON.stringify({ error: se?.message ?? "session" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    sessionId = sess.id;
  } else {
    const { data: existing, error: exErr } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("notebook_id", notebookId)
      .eq("user_id", user.id)
      .single();
    if (exErr || !existing) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { error: umErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "user",
    content: message,
  });
  if (umErr) {
    return new Response(JSON.stringify({ error: umErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: history } = await supabase
    .from("chat_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(40);

  const [qEmb] = await embedTexts([message]);
  const { data: matches, error: rpcErr } = await supabase.rpc(
    "match_notebook_chunks",
    {
      query_embedding: toVectorLiteral(qEmb!),
      match_notebook_id: notebookId,
      match_count: 10,
    },
  );

  if (rpcErr) {
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rows = (matches ?? []) as {
    id: string;
    content: string;
    source_id: string;
    chunk_index: number;
    similarity: number;
  }[];

  const sourceIds = [...new Set(rows.map((r) => r.source_id))];
  const { data: sources } =
    sourceIds.length > 0
      ? await supabase
          .from("sources")
          .select("id,title,canonical_url,type")
          .in("id", sourceIds)
      : { data: [] as { id: string; title: string | null; canonical_url: string | null; type: string }[] };

  const sourceMeta = new Map(
    (sources ?? []).map((s) => [
      s.id,
      {
        title: s.title,
        url: s.canonical_url,
        type: s.type,
      },
    ]),
  );

  const citations: Citation[] = rows.map((r, i) => ({
    index: i + 1,
    chunkId: r.id,
    sourceId: r.source_id,
    excerpt: r.content.slice(0, 280),
  }));

  const contextBlock = rows
    .map((r, i) => {
      const sm = sourceMeta.get(r.source_id);
      const label = sm?.title || sm?.url || r.source_id;
      return `[${i + 1}] (source: ${label})\n${r.content}`;
    })
    .join("\n\n---\n\n");

  let webBlock = "";
  if (body.allowWeb) {
    try {
      const web = await tavilySearch(message, 4);
      webBlock = web
        .map(
          (w, i) =>
            `[web${i + 1}] ${w.title} — ${w.url}\n${(w.content ?? "").slice(0, 1200)}`,
        )
        .join("\n\n");
    } catch {
      webBlock = "";
    }
  }

  const systemParts = [
    "You are a careful research assistant for a private notebook.",
    "Answer using the NOTEBOOK CONTEXT below. When you use a fact from a bracketed source like [1] or [web2], cite it inline.",
    "If the context is insufficient, say what is missing instead of inventing.",
    "Write in the same language as the user's question when reasonable.",
  ];
  if (contextBlock) {
    systemParts.push("NOTEBOOK CONTEXT:\n" + contextBlock);
  } else {
    systemParts.push("NOTEBOOK CONTEXT: (empty — no indexed chunks yet.)");
  }
  if (webBlock) {
    systemParts.push(
      "EPHEMERAL WEB SNIPPETS (may be incomplete; cite as [web1], etc.):\n" +
        webBlock,
    );
  }

  const openai = getOpenAI();
  const messagesOpenAI: ChatCompletionMessageParam[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...(history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
        );
      };

      send({ type: "session", sessionId });

      let full = "";
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: messagesOpenAI,
          stream: true,
        });

        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content;
          if (delta) {
            full += delta;
            send({ type: "token", text: delta });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "chat failed";
        send({ type: "error", message: msg });
        controller.close();
        return;
      }

      let imageUrl: string | null = null;
      let imageStoragePath: string | null = null;

      if (body.generateImage && full.trim()) {
        try {
          const imgPrompt = [
            "Educational illustration, clean diagram, no text labels if possible:",
            "Topic:",
            message.slice(0, 200),
            "Summary:",
            full.slice(0, 600),
          ].join(" ");

          const img = await openai.images.generate({
            model: "dall-e-3",
            prompt: imgPrompt.slice(0, 3900),
            size: "1024x1024",
            n: 1,
          });
          const remote = img.data?.[0]?.url;
          if (remote) {
            const imgRes = await fetch(remote);
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const path = `${user.id}/${notebookId}/illustrations/${sessionId}-${Date.now()}.png`;
              const { error: upErr } = await supabase.storage
                .from("sources")
                .upload(path, buf, {
                  contentType: "image/png",
                  upsert: true,
                });
              if (!upErr) {
                imageStoragePath = path;
                const { data: signed } = await supabase.storage
                  .from("sources")
                  .createSignedUrl(path, 60 * 60 * 24 * 7);
                imageUrl = signed?.signedUrl ?? remote;
              } else {
                imageUrl = remote;
              }
            } else {
              imageUrl = remote;
            }
          }
        } catch {
          /* image optional */
        }
      }

      const metadata = {
        citations,
        imageUrl,
        imageStoragePath,
      };

      const { error: amErr } = await supabase.from("chat_messages").insert({
        session_id: sessionId,
        user_id: user.id,
        role: "assistant",
        content: full,
        metadata,
      });

      if (!amErr) {
        await supabase
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);
      }

      send({
        type: "done",
        citations,
        imageUrl,
        imageStoragePath,
        assistantError: amErr?.message,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
