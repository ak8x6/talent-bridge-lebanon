import {
  analyzeGapImpl,
  buildProfileQuery,
  parseCvImpl,
  rerank,
  searchJobsImpl,
  type Profile,
} from "./agent.server";

export type EvalCv = {
  cv_id: string;
  name: string;
  track: string | null;
  level: string | null;
  is_eval: boolean;
  relevant_job_ids: string[];
  raw_text: string;
};

export type EvalRow = {
  cv_id: string;
  track: string;
  level: string;
  precision_at_5: number;
  hit_ids: string[];
  returned_ids: string[];
  latency_ms: number;
  query: string;
};

export type EvalSummary = {
  run_label: string;
  cv_count: number;
  mean_precision_at_5: number;
  mean_latency_ms: number;
  rows: EvalRow[];
};

const K = 5;

/** Parse once and cache on the row so repeat benchmarks skip the LLM parse. */
async function profileFor(cv: EvalCv & { parsed: Profile | null }): Promise<Profile> {
  if (cv.parsed && Array.isArray(cv.parsed.skills)) return cv.parsed;
  const parsed = await parseCvImpl(cv.raw_text);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("eval_cvs").update({ parsed: parsed as never }).eq("cv_id", cv.cv_id);
  return parsed;
}

export async function listSampleCvsImpl() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("eval_cvs")
    .select("cv_id, name, track, level, is_eval, raw_text")
    .order("cv_id");
  if (error) throw new Error(error.message);
  return data ?? [];
}

type EvalCvRow = EvalCv & { parsed: Profile | null };

/** Score one labelled CV end-to-end with the same pipeline visitors get. */
async function scoreCv(cv: EvalCvRow, runLabel: string): Promise<EvalRow> {
  const started = Date.now();
  const profile = await profileFor(cv);
  const searchQuery = buildProfileQuery(profile);
  const retrieved = await searchJobsImpl(searchQuery, 10);
  const gap = await analyzeGapImpl(profile, retrieved);
  // Evaluation must score the same ranked output that visitors see, not the
  // unadjusted semantic candidates that precede fit and location ranking.
  const results = rerank(retrieved, gap, profile);
  const relevant = new Set(cv.relevant_job_ids);
  const returned = results.slice(0, K).map((job) => job.job_id);
  const hits = returned.filter((id) => relevant.has(id));
  const evalRow: EvalRow = {
    cv_id: cv.cv_id,
    track: cv.track ?? "",
    level: cv.level ?? "",
    precision_at_5: hits.length / K,
    hit_ids: hits,
    returned_ids: returned,
    latency_ms: Date.now() - started,
    query: searchQuery,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: insertError } = await supabaseAdmin.from("eval_results").insert({
    run_label: runLabel,
    cv_id: evalRow.cv_id,
    mode: "vector",
    precision_at_5: evalRow.precision_at_5,
    hit_ids: evalRow.hit_ids as never,
    latency_ms: evalRow.latency_ms,
    notes: {
      query: evalRow.query,
      returned_ids: evalRow.returned_ids,
      track: evalRow.track,
      level: evalRow.level,
      candidate_name: cv.name,
    } as never,
  });
  if (insertError) throw new Error(insertError.message);

  return evalRow;
}

/**
 * Benchmark the agent across every labelled evaluation CV and report the mean
 * Precision@5 and latency for the whole run.
 */
export async function runFullEvaluationImpl(runLabel: string): Promise<EvalSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("eval_cvs")
    .select("cv_id, name, track, level, is_eval, relevant_job_ids, raw_text, parsed")
    .eq("is_eval", true)
    .order("cv_id");
  if (error) throw new Error(error.message);

  const cvs: EvalCvRow[] = (data ?? []).map((row) => ({
    cv_id: row.cv_id,
    name: row.name,
    track: row.track,
    level: row.level,
    is_eval: row.is_eval,
    relevant_job_ids: row.relevant_job_ids ?? [],
    raw_text: row.raw_text,
    parsed: (row.parsed ?? null) as Profile | null,
  }));
  if (cvs.length === 0) throw new Error("No labelled benchmark CVs are available to evaluate.");

  const rows: EvalRow[] = [];
  const BATCH = 3;
  for (let i = 0; i < cvs.length; i += BATCH) {
    const batch = cvs.slice(i, i + BATCH);
    const scored = await Promise.all(batch.map((cv) => scoreCv(cv, runLabel)));
    rows.push(...scored);
  }

  return {
    run_label: runLabel,
    cv_count: rows.length,
    mean_precision_at_5: rows.reduce((s, r) => s + r.precision_at_5, 0) / rows.length,
    mean_latency_ms: Math.round(rows.reduce((s, r) => s + r.latency_ms, 0) / rows.length),
    rows,
  };
}

export async function clearEvalHistoryImpl(): Promise<{ deleted: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("eval_results").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
  return { deleted: true };
}
