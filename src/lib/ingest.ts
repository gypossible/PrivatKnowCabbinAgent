import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "@/lib/chunking";
import { embedTexts } from "@/lib/openai-server";
import { toVectorLiteral } from "@/lib/vector";

export async function ingestPlainText(params: {
  supabase: SupabaseClient;
  notebookId: string;
  sourceId: string;
  userId: string;
  text: string;
}): Promise<{ chunkCount: number }> {
  const { supabase, notebookId, sourceId, userId, text } = params;
  const parts = chunkText(text);
  if (parts.length === 0) {
    return { chunkCount: 0 };
  }

  const batchSize = 16;
  let total = 0;
  for (let i = 0; i < parts.length; i += batchSize) {
    const slice = parts.slice(i, i + batchSize);
    const embeddings = await embedTexts(slice);
    const rows = slice.map((content, j) => ({
      notebook_id: notebookId,
      source_id: sourceId,
      user_id: userId,
      chunk_index: i + j,
      content,
      embedding: toVectorLiteral(embeddings[j]!),
    }));
    const { error } = await supabase.from("document_chunks").insert(rows);
    if (error) throw error;
    total += rows.length;
  }
  return { chunkCount: total };
}
