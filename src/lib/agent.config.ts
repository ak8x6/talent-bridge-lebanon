/** Single source of truth for the models used by the agent. */
export const AGENT_MODEL = "google/gemini-2.5-flash";

/** Stronger model used for the reasoning-heavy tools. */
export const AGENT_STRONG_MODEL = "google/gemini-2.5-pro";

export type AgentTool =
  | "parse_cv"
  | "search_jobs"
  | "reflect_on_results"
  | "analyze_gap"
  | "build_plan"
  | "orchestrator";

/** Per-tool override map — change models for the whole app here. */
export const AGENT_MODEL_OVERRIDES: Partial<Record<AgentTool, string>> = {
  parse_cv: AGENT_MODEL,
  search_jobs: AGENT_MODEL,
  orchestrator: AGENT_MODEL,
  // Reflection only judges topical relevance now, so the fast model is enough
  // and saves several seconds per run.
  reflect_on_results: AGENT_MODEL,
  analyze_gap: AGENT_STRONG_MODEL,
  build_plan: AGENT_STRONG_MODEL,
};

export function modelFor(tool: AgentTool): string {
  return AGENT_MODEL_OVERRIDES[tool] ?? AGENT_MODEL;
}

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 384;

/** Shared guardrail appended to every prompt that produces prose. */
export const NEUTRAL_LANGUAGE_RULE =
  "Never infer gender from a name or any other signal. Refer to the candidate by their name or as \"they\"; never use \"he\", \"she\", \"his\" or \"her\".";
