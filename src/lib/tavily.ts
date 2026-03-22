export type TavilyResult = {
  title: string;
  url: string;
  content?: string;
};

export async function tavilySearch(
  query: string,
  maxResults = 5,
): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error("TAVILY_API_KEY is not configured");
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily error ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? r.url ?? "",
    url: r.url ?? "",
    content: r.content,
  }));
}
