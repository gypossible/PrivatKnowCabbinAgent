import mammoth from "mammoth";

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
