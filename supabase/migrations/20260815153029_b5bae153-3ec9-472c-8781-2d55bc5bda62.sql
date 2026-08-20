ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS retrieval_ranking jsonb,
  ADD COLUMN IF NOT EXISTS reranked_ranking jsonb;