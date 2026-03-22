import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const input = texts.map((t) => t.slice(0, 8000));
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIM,
  });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export { EMBEDDING_DIM, EMBEDDING_MODEL };
