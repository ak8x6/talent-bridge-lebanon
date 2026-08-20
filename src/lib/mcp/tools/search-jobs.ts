import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";
import { embedQuery } from "../embed";

type JobHit = {
  job_id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  seniority: string;
  min_years: number;
  required_skills: string;
  match_percent: number;
};

export default defineTool({
  name: "search_jobs",
  title: "Search the Lebanon job index",
  description:
    "Semantic search over TalentBridge Lebanon's job corpus. Give a natural-language description of a role, skill set or career goal and get the closest-matching jobs with a similarity score.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .min(3)
      .max(1000)
      .describe("Natural-language description of the role, skills or career goal."),
    top_k: z.number().int().min(1).max(20).default(5).describe("How many jobs to return (1-20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, top_k }) => {
    const embedding = await embedQuery(query);
    const { data, error } = await supabaseAnon().rpc("match_jobs_vector", {
      query_embedding: JSON.stringify(embedding),
      match_count: top_k ?? 5,
    });
    if (error) throw new ToolError(`Job search failed: ${error.message}`);

    // `track` is a held-out evaluation label and is never returned.
    const jobs: JobHit[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      job_id: String(row['job_id'] ?? ""),
      title: String(row['title'] ?? ""),
      company: String(row['company'] ?? ""),
      location: String(row['location'] ?? ""),
      work_mode: String(row['work_mode'] ?? ""),
      seniority: String(row['seniority'] ?? ""),
      min_years: Number(row['min_years'] ?? 0) || 0,
      required_skills: String(row['required_skills'] ?? ""),
      match_percent: Math.round((Number(row['score'] ?? 0) || 0) * 100),
    }));

    const text = jobs.length
      ? jobs
          .map(
            (j, i) =>
              `${i + 1}. ${j.title} · ${j.company} (${j.job_id}) — ${j.match_percent}% match, ${j.seniority}, ${j.location}, ${j.work_mode}. Requires: ${j.required_skills}`,
          )
          .join("\n")
      : "No jobs matched that query.";

    return { content: [{ type: "text", text }], structuredContent: { jobs } };
  },
});