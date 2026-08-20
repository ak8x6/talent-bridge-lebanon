import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EvalSummary } from "./eval.server";

export const listSampleCvs = createServerFn({ method: "GET" }).handler(async () => {
  const { listSampleCvsImpl } = await import("./eval.server");
  return listSampleCvsImpl();
});

export const runEvaluation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        run_label: z.string().min(1).max(60),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<EvalSummary> => {
    const { runFullEvaluationImpl } = await import("./eval.server");
    return runFullEvaluationImpl(data.run_label);
  });

export const clearEvalHistory = createServerFn({ method: "POST" }).handler(async () => {
  const { clearEvalHistoryImpl } = await import("./eval.server");
  return clearEvalHistoryImpl();
});
