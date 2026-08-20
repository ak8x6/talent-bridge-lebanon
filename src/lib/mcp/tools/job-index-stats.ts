import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseAnon } from "../supabase";

export default defineTool({
  name: "job_index_stats",
  title: "Job index stats",
  description:
    "Report how many jobs are in the TalentBridge Lebanon retrieval corpus and how many of them have vector embeddings ready for semantic search.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = supabaseAnon();
    const total = await supabase.from("jobs").select("id", { count: "exact", head: true });
    if (total.error) throw new ToolError(`Stats failed: ${total.error.message}`);
    const embedded = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    if (embedded.error) throw new ToolError(`Stats failed: ${embedded.error.message}`);

    const stats = { total_jobs: total.count ?? 0, embedded_jobs: embedded.count ?? 0 };
    return {
      content: [
        {
          type: "text",
          text: `${stats.total_jobs} jobs in the index, ${stats.embedded_jobs} with embeddings ready for semantic search.`,
        },
      ],
      structuredContent: stats,
    };
  },
});