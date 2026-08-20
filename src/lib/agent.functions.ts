import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AgentResult, GapItem, JobMatch, Plan, Profile, Reflection } from "./agent.server";

export const parseCv = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ cv_text: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<Profile> => {
    const { parseCvImpl } = await import("./agent.server");
    return parseCvImpl(data.cv_text);
  });

export const searchJobs = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ query_text: z.string().min(1), top_k: z.number().int().min(1).max(20) })
      .parse(data),
  )
  .handler(async ({ data }): Promise<JobMatch[]> => {
    const { searchJobsImpl } = await import("./agent.server");
    return searchJobsImpl(data.query_text, data.top_k);
  });

export const analyzeGap = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ profile: z.any(), jobs: z.array(z.any()) }).parse(data))
  .handler(async ({ data }): Promise<GapItem[]> => {
    const { analyzeGapImpl } = await import("./agent.server");
    return analyzeGapImpl(data.profile as Profile, data.jobs as JobMatch[]);
  });

export const reflectOnResults = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ profile: z.any(), jobs: z.array(z.any()) }).parse(data))
  .handler(async ({ data }): Promise<Reflection> => {
    const { reflectOnResultsImpl } = await import("./agent.server");
    return reflectOnResultsImpl(data.profile as Profile, data.jobs as JobMatch[]);
  });

export const buildPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ profile: z.any(), gap_analysis: z.array(z.any()) }).parse(data))
  .handler(async ({ data }): Promise<Plan> => {
    const { buildPlanImpl } = await import("./agent.server");
    return buildPlanImpl(data.profile as Profile, data.gap_analysis as GapItem[]);
  });

export const runAgent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ cv_text: z.string().min(20) }).parse(data),
  )
  .handler(async ({ data }): Promise<AgentResult> => {
    const { runAgentImpl } = await import("./agent.server");
    return runAgentImpl(data.cv_text);
  });
