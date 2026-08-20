import { defineMcp } from "@lovable.dev/mcp-js";
import searchJobsTool from "./tools/search-jobs";
import getJobTool from "./tools/get-job";
import assessFitTool from "./tools/assess-fit";
import jobIndexStatsTool from "./tools/job-index-stats";

export default defineMcp({
  name: "talentbridge-lebanon",
  title: "TalentBridge Lebanon",
  version: "0.1.0",
  instructions:
    "Tools over TalentBridge Lebanon's curated Lebanese tech job corpus. Use `search_jobs` for semantic role matching from a natural-language description of a candidate or goal, `get_job` to read one job in full, `assess_fit` to compare a candidate's skills against a job's requirements, and `job_index_stats` to check corpus coverage.",
  // exactOptionalPropertyTypes vs. the SDK's optional `outputSchema` field.
  tools: [searchJobsTool, getJobTool, assessFitTool, jobIndexStatsTool] as unknown as Parameters<
    typeof defineMcp
  >[0]["tools"],
});