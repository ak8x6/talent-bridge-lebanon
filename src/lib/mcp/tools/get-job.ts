import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "get_job",
  title: "Get a job by ID",
  description: "Fetch the full details of one job in the TalentBridge Lebanon index by its job ID (e.g. J0042).",
  inputSchema: {
    job_id: z.string().trim().min(1).max(20).describe("Job ID such as J0042."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_id }) => {
    const { data, error } = await supabaseAnon()
      .from("jobs")
      .select("job_id,title,company,location,work_mode,seniority,min_years,required_skills,description")
      .eq("job_id", job_id.toUpperCase())
      .maybeSingle();
    if (error) throw new ToolError(`Lookup failed: ${error.message}`);
    if (!data) throw new ToolError(`No job found with ID ${job_id}.`);

    const text = [
      `${data.title} · ${data.company} (${data.job_id})`,
      `Seniority: ${data.seniority} · Minimum experience: ${data.min_years} year(s)`,
      `Location: ${data.location} · Work mode: ${data.work_mode}`,
      `Required skills: ${data.required_skills}`,
      data.description ? `\n${data.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text", text }], structuredContent: { job: data } };
  },
});