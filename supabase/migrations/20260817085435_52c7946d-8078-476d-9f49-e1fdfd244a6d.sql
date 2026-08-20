create table if not exists public.eval_cvs (
  cv_id text primary key,
  name text not null,
  track text,
  level text,
  relevant_job_ids text[] not null default '{}',
  is_eval boolean not null default true,
  raw_text text not null,
  parsed jsonb,
  created_at timestamptz not null default now()
);

grant select on public.eval_cvs to anon;
grant select on public.eval_cvs to authenticated;
grant all on public.eval_cvs to service_role;

alter table public.eval_cvs enable row level security;

drop policy if exists "Eval CVs are publicly readable" on public.eval_cvs;
create policy "Eval CVs are publicly readable" on public.eval_cvs for select using (true);

alter table public.eval_results add column if not exists notes jsonb;