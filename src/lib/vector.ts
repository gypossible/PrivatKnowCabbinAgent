/** Format embedding for PostgREST / pgvector columns */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
