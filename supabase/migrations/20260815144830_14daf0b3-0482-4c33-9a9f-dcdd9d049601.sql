CREATE OR REPLACE FUNCTION public.match_jobs_vector(query_embedding vector(384), match_count int)
RETURNS TABLE (
  id uuid,
  job_id text,
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
  created_at timestamptz,
  score double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT j.id, j.job_id, j.title, j.company, j.location, j.work_mode, j.seniority,
         j.min_years, j.employment_type, j.track, j.required_skills, j.description,
         j.created_at,
         (1 - (j.embedding <=> query_embedding))::double precision AS score
  FROM public.jobs j
  WHERE j.embedding IS NOT NULL
  ORDER BY j.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.match_jobs_keyword(query_text text, match_count int)
RETURNS TABLE (
  id uuid,
  job_id text,
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
  created_at timestamptz,
  score double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT j.id, j.job_id, j.title, j.company, j.location, j.work_mode, j.seniority,
         j.min_years, j.employment_type, j.track, j.required_skills, j.description,
         j.created_at,
         ts_rank(
           to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.required_skills,'') || ' ' || coalesce(j.description,'')),
           plainto_tsquery('english', query_text)
         )::double precision AS score
  FROM public.jobs j
  WHERE to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.required_skills,'') || ' ' || coalesce(j.description,''))
        @@ plainto_tsquery('english', query_text)
  ORDER BY score DESC
  LIMIT GREATEST(match_count, 0);
$$;

CREATE INDEX IF NOT EXISTS jobs_fts_idx ON public.jobs
USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(required_skills,'') || ' ' || coalesce(description,'')));

GRANT EXECUTE ON FUNCTION public.match_jobs_vector(vector(384), int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_jobs_keyword(text, int) TO anon, authenticated, service_role;