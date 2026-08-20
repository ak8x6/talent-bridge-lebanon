import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../agent.config";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Embeds a natural-language query with the same model used to index the corpus. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The embedding service is not configured.");
  const response = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit reached, please try again shortly.");
    throw new Error(`The embedding service is unavailable (status ${response.status}).`);
  }
  const payload = (await response.json()) as { data?: { embedding?: number[] }[] };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) throw new Error("Could not embed the search query.");
  return embedding;
}