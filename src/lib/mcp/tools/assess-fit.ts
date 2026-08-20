import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";
import { assessSkills } from "../../skill-match";

export default defineTool({
  name: "assess_fit",
  title: "Assess fit against a job",
  description:
    "Compare a list of candidate skills against one job's required skills and return matched skills, missing skills and a readiness percentage computed in code from the job record.",
  inputSchema: {
    job_id: z.string().trim().min(1).max(20).describe("Job ID such as J0042."),
    skills: z
      .array(z.string().trim().min(1).max(60))
      .min(1)
      .max(60)
      .describe("Candidate skills, one per array entry."),
    inferred_skills: z
      .array(z.string().trim().min(1).max(60))
      .max(5)
      .optional()
      .describe("Evidence-backed inferred skills, if available."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_id, skills, inferred_skills }) => {
    const { data, error } = await supabaseAnon()
      .from("jobs")
      .select("job_id,title,company,required_skills,min_years,seniority")
      .eq("job_id", job_id.toUpperCase())
      .maybeSingle();
    if (error) throw new ToolError(`Lookup failed: ${error.message}`);
    if (!data) throw new ToolError(`No job found with ID ${job_id}.`);

    const { matched, missing, readiness } = assessSkills(
      data.required_skills,
      skills,
      inferred_skills ?? [],
    );

    const text = [
      `${data.title} · ${data.company} (${data.job_id}) — readiness ${readiness}%`,
      `Matched skills: ${matched.join(", ") || "none"}`,
      `Missing skills: ${missing.join(", ") || "none"}`,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        job_id: data.job_id,
        title: data.title,
        company: data.company,
        matched_skills: matched,
        missing_skills: missing,
        readiness_percent: readiness,
      },
    };
  },
});