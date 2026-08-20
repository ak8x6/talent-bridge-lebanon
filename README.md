# TalentBridge Lebanon

**An AI career-matching agent for Lebanese computer-science graduates.**
Upload a CV, and an LLM agent parses the profile, retrieves roles from an embedded job
corpus by semantic similarity, computes a deterministic skill gap for each role,
re-ranks with Lebanon-aware and seniority-aware signals, and writes a personalised
4-week upskilling plan — end to end in ~15–20 seconds.

Live demo: https://talent-bridge-lebanon.lovable.app

**Results (benchmark run: 2026-08-20 15:51)**

| Metric | Value |
| --- | --- |
| Mean Precision@5 | 0.84, across 15 labelled CVs |
| Retrieval stage | 467 ms per CV (CV parse + embedding + vector search) |
| Full agent run | ~15–20 seconds end to end, including the LLM steps |
| Index coverage | 180 of 180 jobs embedded |

---

## Why this project

Lebanese CS graduates apply blindly: job boards are keyword-based, don't understand
transferable skills, and don't tell you *why* you were rejected or *what to learn next*.
TalentBridge closes that loop with a retrieval-augmented agent that is **measurable** —
every ranking change is validated against a labelled benchmark of 15 CVs with a
Precision@5 harness built into the app.

## Dataset

The 180-job corpus and the labelled benchmark CVs are synthetic, generated with AI assistance.
Job titles, seniority levels, and skill combinations were modelled on real job postings from
Lebanon and the wider region so the distribution reflects the actual market, while company
names are fictional. The data was generated for two reasons: there is no public dataset of
Lebanese job listings that could be used, and the benchmark requires a correct track label
on every job, which scraped postings do not have.

A direct limitation is that results are demonstrated on clean, well-structured records.
Performance on real-world postings, which are messier and often incomplete, has not been
measured.

## Features

- **Agentic pipeline** — `parse_cv` → `search_jobs` → `reflect_on_results` → `analyze_gap` → `build_plan`, orchestrated deterministically with a reflection-driven retry.
- **Semantic retrieval** — 384-dim embeddings over 180 jobs, exact cosine search in Postgres (`pgvector`).
- **Deterministic, hallucination-proof scoring** — matched/missing skills and readiness are computed in code from the database's `required_skills`, never by the model. The narrative prose is derived from those exact sets, so the text can never contradict the lists.
- **Lebanon-first re-ranking** — final score = `0.35·semantic + 0.20·readiness + 0.25·location + 0.15·seniority + 0.05·domain`, with tiered location fit (Lebanese city 1.0 → remote 0.95 → MENA 0.75) and an over-leveled penalty.
- **Built-in evaluation** — `/eval` runs the whole labelled CV set and reports mean Precision@5 and mean retrieval latency, with session-local run history.
- **PDF parsing in the browser** — `pdfjs-dist` extracts CV text client-side; nothing is stored until matching starts.
- **MCP server** — `/mcp` exposes `search_jobs`, `get_job`, `assess_fit` and `job_index_stats` so any MCP client (Claude, Cursor, …) can query the corpus.
- **Downloadable report** — the results page exports a Markdown report identical to what is on screen.

## Architecture

```text
Browser (React 19 + TanStack Start)
  │  PDF text extraction (pdfjs-dist)
  ▼
Server functions (createServerFn, Cloudflare Workers runtime)
  ├─ parse_cv          LLM  → profile, skills (+inferred, cited), domains
  ├─ years/level       code → merged work periods, Intern/Junior/Mid
  ├─ search_jobs       embed query → match_jobs_vector() over pgvector
  ├─ reflect_on_results LLM → topical relevance check, max 1 retry (pooled results)
  ├─ analyze_gap       code → matched/missing skills, readiness %
  ├─ rerank            code → weighted blend (semantic/readiness/location/seniority/domain)
  └─ build_plan        LLM  → 4-week plan grounded in the missing skills
       ▼
Postgres (Supabase + pgvector): jobs, candidates, agent_runs, eval_cvs, eval_results
```

### Tech stack

| Layer | Choice |
| --- | --- |
| Framework | TanStack Start v1 (React 19, Vite 7, SSR on Cloudflare Workers) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Postgres with `pgvector` (Supabase / Lovable Cloud) |
| LLM | `google/gemini-2.5-flash` (+ `gemini-2.5-pro` for reasoning-heavy steps) via the Lovable AI Gateway |
| Embeddings | `openai/text-embedding-3-small`, 384 dimensions |
| Agent interop | Model Context Protocol server at `/mcp` |

## Repository layout

```text
src/routes/            file-based routes: / (run agent), /results, /admin, /eval, /mcp
src/lib/agent.server.ts   the agent: parsing, retrieval, gap analysis, re-ranking, planning
src/lib/agent.config.ts   single source of truth for models and prompt guardrails
src/lib/skill-match.ts    canonical skill normalisation + shared matched/missing logic
src/lib/eval.server.ts    Precision@5 benchmark harness across the labelled CV set
src/lib/mcp/             MCP server and its four tools
supabase/migrations/     full schema: tables, RLS, grants, match_jobs_vector()
data/                    exported datasets (180 jobs; 15 labelled benchmark CVs + 2 demo profiles)
```

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Pick a benchmark CV or upload your own, then run the agent. |
| `/results` | Parsed profile, top 5 matches with match %, gap analysis per match, 4-week plan, report download. Session-only — visitors never see someone else's run. |
| `/admin` | Job index: CSV import, embedding coverage, corpus integrity check. |
| `/eval` | Runs the agent across every labelled CV and reports mean Precision@5 and mean retrieval latency. |

## Evaluation

Ground truth lives in `eval_cvs.relevant_job_ids`. For each CV the harness runs the
*exact same* pipeline a visitor gets (including re-ranking) and computes
`Precision@5 = |top5 ∩ relevant| / 5`, then averages across the set together with
per-CV retrieval latency. Because relevance is defined by track *and* compatible seniority,
ranking changes are validated rather than guessed.

## Running locally

```sh
git clone https://github.com/ak8x6/talent-bridge-lebanon.git
cd talent-bridge-lebanon
bun install
bun run dev            # http://localhost:8080
```

If you prefer npm:

```sh
npm install
npm run dev            # http://localhost:8080
```

Environment variables (a `.env` is required, none are committed):

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
LOVABLE_API_KEY=...        # server-side only: LLM + embedding gateway
```

Database setup: apply `supabase/migrations/*.sql` in order, import `data/jobs.csv`
via `/admin`, then click **Generate embeddings**. Load `data/eval_cvs.csv` into
`eval_cvs` to enable the benchmark.

## Security notes

- No secrets in client code; gateway keys are read only inside server-function handlers.
- Row-level security and explicit grants on every public table.
- The `track` column is never exposed through retrieval, the UI, or the MCP tools — it is an evaluation label only.
- Prompts forbid inferring gender from names; all generated prose is gender-neutral.

## License

MIT © 2026 Ahmad Kassem — see [LICENSE](./LICENSE).
