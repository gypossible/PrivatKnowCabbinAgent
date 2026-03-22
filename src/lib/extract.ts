import { Readability } from "@mozilla/readability";
import mammoth from "mammoth";
import { JSDOM } from "jsdom";

export async function extractTextFromBuffer(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();
  if (
    mime.includes("markdown") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    mime === "text/plain"
  ) {
    return buffer.toString("utf-8");
  }
  if (
    mime.includes("pdf") ||
    lower.endsWith(".pdf") ||
    mime === "application/pdf"
  ) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    lower.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
  throw new Error(`Unsupported file type: ${mime || "unknown"} (${filename})`);
}

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
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title?.trim() || url;
  const text = article?.textContent?.trim() || "";
  if (!text) {
    throw new Error("Could not extract readable text from page");
  }
  return { title, text };
}
