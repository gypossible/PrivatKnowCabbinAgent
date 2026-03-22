export function chunkText(
  text: string,
  maxChars = 1400,
  overlap = 200,
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + maxChars, cleaned.length);
    let slice = cleaned.slice(start, end);
    if (end < cleaned.length) {
      const lastBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("。"),
      );
      if (lastBreak > maxChars * 0.4) {
        slice = slice.slice(0, lastBreak + 1);
      }
    }
    const trimmed = slice.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    const step = Math.max(1, slice.length - overlap);
    start += step;
  }
  return chunks;
}
