CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text UNIQUE,
  title text,
  company text,
  location text,
  work_mode text,
  seniority text,
  min_years int,
  employment_type text,
  track text,
  required_skills text,
  description text,
  embedding vector(384),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id text,
  name text,
  raw_text text,
  parsed jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  mode text,
  trace jsonb,
  top_matches jsonb,
  gap jsonb,
  plan jsonb,
  latency_ms int,
  retries int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.eval_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label text,
  cv_id text,
  mode text,
  precision_at_5 float,
  hit_ids jsonb,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jobs_embedding_ivfflat_idx ON public.jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO anon, authenticated;
GRANT ALL ON public.jobs TO service_role;
GRANT SELECT, INSERT ON public.candidates TO anon, authenticated;
GRANT ALL ON public.candidates TO service_role;
GRANT SELECT, INSERT ON public.agent_runs TO anon, authenticated;
GRANT ALL ON public.agent_runs TO service_role;
GRANT SELECT, INSERT ON public.eval_results TO anon, authenticated;
GRANT ALL ON public.eval_results TO service_role;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_public_read" ON public.jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "jobs_public_insert" ON public.jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "jobs_public_update" ON public.jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "jobs_public_delete" ON public.jobs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "candidates_public_read" ON public.candidates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "candidates_public_insert" ON public.candidates FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "agent_runs_public_read" ON public.agent_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "agent_runs_public_insert" ON public.agent_runs FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "eval_results_public_read" ON public.eval_results FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "eval_results_public_insert" ON public.eval_results FOR INSERT TO anon, authenticated WITH CHECK (true);