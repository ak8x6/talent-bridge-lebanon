DROP FUNCTION IF EXISTS public.match_jobs_vector(vector, integer);
DROP FUNCTION IF EXISTS public.match_jobs_vector(vector, integer, text[], text);

CREATE OR REPLACE FUNCTION public.match_jobs_vector(query_embedding vector, match_count integer)
 RETURNS TABLE(id uuid, job_id text, title text, company text, location text, work_mode text, seniority text, min_years integer, employment_type text, track text, required_skills text, description text, created_at timestamp with time zone, score double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT j.id, j.job_id, j.title, j.company, j.location, j.work_mode, j.seniority,
         j.min_years, j.employment_type, j.track, j.required_skills, j.description,
         j.created_at,
         (1 - (j.embedding <=> query_embedding))::double precision AS score
  FROM public.jobs j
  WHERE j.embedding IS NOT NULL
  ORDER BY j.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0);
$function$;