# Datasets

| File | Rows | Description |
| --- | --- | --- |
| `jobs.csv` | 180 | Curated Lebanese / MENA tech job corpus (`J0001`–`J0180`). Columns: `job_id, title, company, location, work_mode, seniority, min_years, employment_type, track, required_skills, description`. The `track` column is a held-out evaluation label — it is **never** used for retrieval or shown to the user. |
| `eval_cvs.csv` | 17 | Benchmark CVs. Columns: `cv_id, name, track, level, is_eval, relevant_job_ids, raw_text`. `relevant_job_ids` is the ground-truth relevance set used to compute Precision@5. Rows with `is_eval = false` are adversarial demo profiles. |

Embeddings are not shipped in the CSVs — they are regenerated from the job text
by the "Generate embeddings" action on `/admin`.

Import order: apply `supabase/migrations/*.sql`, load `jobs.csv` through the
`/admin` CSV importer, then generate embeddings.
