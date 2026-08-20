import { createServerFn } from "@tanstack/react-start";

/**
 * Embeds up to 20 jobs that have no embedding yet.
 * NOTE: the `track` column is a held-out evaluation label and is deliberately
 * never selected here nor included in the embedding input text.
 */
export const embedJobsBatch = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ processed: number; remaining: number }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Embedding service is not configured.");

    const EMBEDDING_MODEL = "openai/text-embedding-3-small";
    const EMBEDDING_DIMENSIONS = 384;
    const BATCH_SIZE = 20;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: jobs, error } = await supabaseAdmin
      .from("jobs")
      .select(
        "id, title, company, location, work_mode, seniority, min_years, employment_type, required_skills, description",
      )
      .is("embedding", null)
      .limit(BATCH_SIZE);
    if (error) throw new Error(error.message);

    const pending = jobs ?? [];
    if (pending.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    const inputs = pending.map(
      (job) =>
        `${job.title ?? ""} at ${job.company ?? ""}. ${job.seniority ?? ""} level, ${job.min_years ?? 0}+ years experience, ${job.employment_type ?? ""}, ${job.location ?? ""} (${job.work_mode ?? ""}). Required skills: ${job.required_skills ?? ""}. ${job.description ?? ""}`,
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limit reached, try again shortly.");
      if (response.status === 402) throw new Error("Embedding credits exhausted.");
      console.error("[embed-jobs] gateway error", response.status, await response.text());
      throw new Error("Embedding service is unavailable.");
    }

    const payload = (await response.json()) as {
      data: { index: number; embedding: number[] }[];
    };

    const vectors = new Map<number, number[]>();
    for (const item of payload.data) vectors.set(item.index, item.embedding);

    let processed = 0;
    for (let i = 0; i < pending.length; i += 1) {
      const embedding = vectors.get(i);
      const job = pending[i];
      if (!embedding || !job) continue;
      const { error: updateError } = await supabaseAdmin
        .from("jobs")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", job.id);
      if (updateError) throw new Error(updateError.message);
      processed += 1;
    }

    const { count, error: countError } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);
    if (countError) throw new Error(countError.message);

    return { processed, remaining: count ?? 0 };
  },
);