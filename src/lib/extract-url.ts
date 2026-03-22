import { load } from "cheerio";

export async function extractTextFromUrl(url: string): Promise<{
  title: string;
  text: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "PrivateKnowledgeBase/1.0 (research; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = load(html);
  $("script,style,noscript,iframe,svg").remove();
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    url;
  const main = $("article, main, [role='main']").first();
  const scope = main.length ? main : $("body");
  let text = scope.text().replace(/\s+/g, " ").trim();
  if (text.length < 80) {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  if (!text) {
    throw new Error("Could not extract readable text from page");
  }
  return { title, text };
}
