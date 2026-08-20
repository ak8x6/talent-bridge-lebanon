create or replace function public.match_jobs_keyword(query_text text, match_count integer)
returns table (
  id uuid, job_id text, title text, company text, location text, work_mode text,
  seniority text, min_years integer, employment_type text, track text,
  required_skills text, description text, created_at timestamptz, score double precision
)
language sql
stable
set search_path to 'public'
as $function$
  with q as (
    select to_tsquery(
             'english',
             nullif(string_agg(quote_literal(lexeme), ' | '), '')
           ) as tsq
    from unnest(to_tsvector('english', coalesce(query_text, '')))
  )
  select j.id, j.job_id, j.title, j.company, j.location, j.work_mode, j.seniority,
         j.min_years, j.employment_type, j.track, j.required_skills, j.description,
         j.created_at,
         ts_rank(
           to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.required_skills,'') || ' ' || coalesce(j.description,'')),
           q.tsq
         )::double precision as score
  from public.jobs j, q
  where q.tsq is not null
    and to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.required_skills,'') || ' ' || coalesce(j.description,''))
        @@ q.tsq
  order by score desc
  limit greatest(match_count, 0);
$function$;