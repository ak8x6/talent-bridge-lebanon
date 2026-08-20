CREATE OR REPLACE FUNCTION public.match_jobs_vector(
  query_embedding vector(384),
  match_count int,
  seniority_in text[] DEFAULT NULL,
  location_contains text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, job_id text, title text, company text, location text, work_mode text,
  seniority text, min_years int, employment_type text, track text,
  required_skills text, description text, created_at timestamptz, score double precision
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
    AND (seniority_in IS NULL OR array_length(seniority_in, 1) IS NULL
         OR lower(coalesce(j.seniority,'')) = ANY (SELECT lower(s) FROM unnest(seniority_in) s))
    AND (location_contains IS NULL OR location_contains = ''
         OR coalesce(j.location,'') ILIKE '%' || location_contains || '%')
  ORDER BY j.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0);
$$;

GRANT EXECUTE ON FUNCTION public.match_jobs_vector(vector, int, text[], text) TO anon, authenticated, service_role;