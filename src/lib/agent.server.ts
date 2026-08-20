/**
 * Server-only implementation of the agentic matching pipeline.
 * The `track` column is a held-out evaluation label: it is never selected,
 * never embedded and never returned to the client or the LLM.
 */
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  NEUTRAL_LANGUAGE_RULE,
  modelFor,
  type AgentTool,
} from "./agent.config";
import { assessSkills, canonicalSkill, deterministicSkillVerdict } from "./skill-match";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type Profile = {
  name: string;
  level: "Intern" | "Junior" | "Mid-level";
  years_experience: number;
  /** Work history used to compute years_experience in code. */
  positions?: { title: string; company: string; start: string; end: string }[];
  skills: string[];
  inferred_skills: string[];
  /** Each inferred skill with the CV evidence that implies it. */
  inferred_skills_detail?: { skill: string; evidence: string }[];
  education: string;
  domains: string[];
  preferred_roles: string[];
  location: string;
  summary: string;
};

export type JobMatch = {
  job_id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  seniority: string;
  min_years: number;
  required_skills: string;
  score: number;
  /** min-max normalised retrieval score across the retrieved set */
  normalized_score?: number;
  readiness_score?: number;
  location_bonus?: number;
  seniority_bonus?: number;
  domain_bonus?: number;
  final_score?: number;
  retrieval_rank?: number;
  final_rank?: number;
  rank_delta?: number;
};

export type GapItem = {
  job_id: string;
  matched_skills: string[];
  missing_skills: string[];
  readiness_score: number;
  one_line_verdict: string;
};

export type Plan = {
  focus_skills: string[];
  weeks: { week: number; goal: string; resources: string[]; deliverable: string }[];
  portfolio_project: { title: string; description: string; why_it_closes_the_gap: string };
};

export type Reflection = {
  sufficient: boolean;
  reason: string;
  revised_query: string | null;
};

export type RankingEntry = { job_id: string; title: string; company: string; rank: number; score: number };

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI service is not configured.");
  return key;
}

async function gateway(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit reached, please try again shortly.");
    if (response.status === 402) throw new Error("AI credits exhausted.");
    const text = await response.text();
    console.error("[agent] gateway error", response.status, text);
    throw new Error("AI service is unavailable.");
  }
  return response.json();
}

function extractJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The AI response could not be parsed.");
  }
}

async function jsonCompletion(tool: AgentTool, system: string, user: string): Promise<any> {
  const payload = await gateway("/chat/completions", {
    model: modelFor(tool),
    // These are extraction/judgement tasks with explicit rules and code-side
    // grounding; internal "thinking" added 8-20s per call without changing the
    // output, so it is switched off.
    reasoning_effort: "none",
    messages: [
      { role: "system", content: `${system}\n${NEUTRAL_LANGUAGE_RULE}` },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  return extractJson(payload.choices?.[0]?.message?.content ?? "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Level is derived in code so it can never disagree with years_experience. */
export function levelFor(years: number): Profile["level"] {
  if (years < 1) return "Intern";
  if (years <= 3) return "Junior";
  return "Mid-level";
}

/** "YYYY-MM" / "present" -> absolute month index. */
function monthIndex(value: string, fallback: number): number {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "present" || raw === "current" || raw === "now" || raw === "today") return fallback;
  const match = raw.match(/(\d{4})[-/. ]?(\d{1,2})?/);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Math.min(12, Math.max(1, Number(match[2] ?? 1)));
  return year * 12 + (month - 1);
}

/**
 * Convert positions to month ranges, merge overlaps so concurrent roles are not
 * double counted, and sum. Returns total years.
 */
export function yearsFromPositions(
  positions: { start: string; end: string }[],
  now = new Date(),
): number {
  const nowIndex = now.getFullYear() * 12 + now.getMonth();
  const ranges = positions
    .map((position) => {
      const start = monthIndex(position.start, nowIndex);
      const end = monthIndex(position.end, nowIndex);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((a, b) => a.start - b.start);

  let months = 0;
  let cursorStart = -1;
  let cursorEnd = -1;
  for (const range of ranges) {
    if (cursorEnd < 0) {
      cursorStart = range.start;
      cursorEnd = range.end;
      continue;
    }
    if (range.start <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, range.end);
    } else {
      months += cursorEnd - cursorStart;
      cursorStart = range.start;
      cursorEnd = range.end;
    }
  }
  if (cursorEnd >= 0) months += cursorEnd - cursorStart;
  return Math.round((months / 12) * 100) / 100;
}

/**
 * search_jobs embeds its query, so boolean/field syntax is noise.
 * Strip it down to plain keywords.
 */
export function sanitizeQuery(raw: string): string {
  let q = String(raw ?? "");
  if (/[:()"']/.test(q) || /\s(AND|OR|NOT)\s/.test(q)) {
    q = q
      .replace(/\b[A-Za-z_]+\s*:\s*/g, " ")
      .replace(/[()"'\[\]{}]/g, " ")
      .replace(/\s+(AND|OR|NOT)\s+/g, " ")
      .replace(/[|&+*~^]/g, " ");
  }
  return q.replace(/\s+/g, " ").trim();
}

/* ---------------------------------- tools --------------------------------- */

export async function parseCvImpl(cvText: string): Promise<Profile> {
  const raw = await jsonCompletion(
    "parse_cv",
    `You extract structured profiles from CVs of Lebanese computer science graduates. Today's date is ${today()}.
List EVERY position in the professional work history — internships, past jobs and the current job — with exact start and end months. Do NOT compute any duration, total or seniority level: those are calculated outside the model. Use "present" for a role that is still ongoing.
Also return inferred_skills: AT MOST 5 skills strongly implied by the CV but not literally written (for example scikit-learn, Pandas or PyTorch imply Python; React implies JavaScript; Kubernetes implies Docker and Linux). Every inferred skill MUST cite the exact CV evidence that implies it; if there is no concrete evidence in the CV, omit the skill. Keep inferred_skills disjoint from the explicit skills array.
Always return domains: 2-4 technical problem areas inferred from the CV's projects, job titles and tooling (for example Natural Language Processing, Time Series Forecasting, Computer Vision, Distributed Systems). Never leave domains empty.
Reply with JSON only.`,
    `Return JSON with keys: name (string), positions (array of {"title": string, "company": string, "start": "YYYY-MM", "end": "YYYY-MM" or "present"}, one entry per role in the work history, oldest first), skills (array of strings written explicitly in the CV), inferred_skills (array of at most 5 objects {"skill": string, "evidence": string quoting the CV text that implies it}), education (string), domains (array of 2-4 inferred domain-area strings, never empty), preferred_roles (array of strings), location (string, city/country from the CV, empty string if absent), summary (string).\n\nCV:\n${cvText.slice(0, 20000)}`,
  );
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const skills = arr(raw.skills);
  const explicit = new Set(skills.map(norm));
  const positions = (Array.isArray(raw.positions) ? raw.positions : []).map((entry: any) => ({
    title: String(entry?.title ?? ""),
    company: String(entry?.company ?? ""),
    start: String(entry?.start ?? ""),
    end: String(entry?.end ?? "present"),
  }));
  const years = yearsFromPositions(positions);
  const detail = (Array.isArray(raw.inferred_skills) ? raw.inferred_skills : [])
    .map((entry: any) =>
      typeof entry === "string"
        ? { skill: entry, evidence: "" }
        : { skill: String(entry?.skill ?? ""), evidence: String(entry?.evidence ?? "") },
    )
    .filter((entry: { skill: string; evidence: string }) =>
      Boolean(entry.skill && entry.evidence.trim() && !explicit.has(norm(entry.skill))),
    )
    .slice(0, 5);
  return {
    name: String(raw.name ?? "Unknown"),
    level: levelFor(years),
    years_experience: years,
    positions,
    skills,
    inferred_skills: detail.map((entry: { skill: string }) => entry.skill),
    inferred_skills_detail: detail,
    education: String(raw.education ?? ""),
    domains: arr(raw.domains),
    preferred_roles: arr(raw.preferred_roles),
    location: String(raw.location ?? ""),
    summary: String(raw.summary ?? ""),
  };
}

export async function searchJobsImpl(
  queryText: string,
  topK: number,
  diagnostics?: { warning?: string },
): Promise<JobMatch[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const matchCount = Math.max(1, Math.min(20, topK || 10));
  const query = sanitizeQuery(queryText);

  const payload = await gateway("/embeddings", {
    model: EMBEDDING_MODEL,
    input: query,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const embedding = payload.data?.[0]?.embedding as number[] | undefined;
  if (!embedding) throw new Error("Could not embed the search query.");
  // Retrieval is purely semantic over the whole corpus: preferences are applied
  // as re-ranking boosts, never as hard SQL filters.
  const { data, error } = await supabaseAdmin.rpc("match_jobs_vector", {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
  });
  if (error) throw new Error(error.message);
  const rows: any[] = data ?? [];

  // Loud failure: retrieval must never silently return fewer rows than available.
  if (diagnostics) {
    const { count } = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .not("embedding", "is", null);
    const expected = Math.min(matchCount, count ?? matchCount);
    if (rows.length < expected) {
      diagnostics.warning = `retrieval underflow: expected ${expected} got ${rows.length}`;
    }
  }

  // `track` is deliberately dropped here.
  return rows.map((row) => ({
    job_id: String(row.job_id ?? row.id ?? ""),
    title: String(row.title ?? ""),
    company: String(row.company ?? ""),
    location: String(row.location ?? ""),
    work_mode: String(row.work_mode ?? ""),
    seniority: String(row.seniority ?? ""),
    min_years: Number(row.min_years ?? 0) || 0,
    required_skills: String(row.required_skills ?? ""),
    score: Number(row.score ?? 0) || 0,
  }));
}

export async function reflectOnResultsImpl(profile: Profile, results: JobMatch[]): Promise<Reflection> {
  void 0;
  return reflectOnResultsInner(profile, results);
}

async function reflectOnResultsInner(profile: Profile, results: JobMatch[]): Promise<Reflection> {
  const raw = await jsonCompletion(
    "reflect_on_results",
    `You review the output of a job search for a software candidate in Lebanon. Judge TOPICAL RELEVANCE ONLY: are these jobs in the same professional field / role family as the candidate's target role?
IGNORE seniority level entirely. IGNORE location, work mode and country entirely. IGNORE salary. Those are handled by a separate re-ranking layer and are NEVER a reason to reject a result set.
Be conservative: only answer sufficient=false when the retrieved jobs are in a clearly different professional field (for example accounting or sales roles for a machine learning candidate). Never reject a result set merely because it is imperfect; a retry costs time and the existing results are kept either way.
revised_query must be PLAIN NATURAL LANGUAGE: no field:value syntax, no AND/OR/NOT, no parentheses, no quotes — just a sentence of role family, seniority, years, location and key skills.
Reply with JSON only.`,
    `Candidate: ${profile.name}, ${profile.level}, ${profile.years_experience} years, ${profile.location}. Roles: ${profile.preferred_roles.join(", ")}. Skills: ${profile.skills.slice(0, 12).join(", ")}.\n\nSearch results:\n${JSON.stringify(
      results.map((job) => ({
        job_id: job.job_id,
        title: job.title,
        company: job.company,
        seniority: job.seniority,
        location: job.location,
        score: Number(job.score.toFixed(3)),
      })),
    )}\n\nReturn JSON {"sufficient": boolean, "reason": string (one sentence), "revised_query": string or null}. If sufficient is false, revised_query must be plain natural language keeping the role family, seniority, years of experience, location and key skills.`,
  );
  const sufficient = Boolean(raw.sufficient);
  const revised = raw.revised_query ? sanitizeQuery(String(raw.revised_query)) : null;
  return {
    sufficient,
    reason: String(raw.reason ?? ""),
    revised_query: sufficient || !revised ? null : revised,
  };
}

export async function analyzeGapImpl(profile: Profile, jobs: JobMatch[]): Promise<GapItem[]> {
  const top = jobs.slice(0, 10);
  if (top.length === 0) return [];
  return top.map((job) => {
    const { matched, missing, readiness } = assessSkills(
      job.required_skills,
      profile.skills,
      profile.inferred_skills,
    );
    return {
      job_id: job.job_id,
      matched_skills: matched,
      missing_skills: missing,
      readiness_score: readiness,
      one_line_verdict: deterministicSkillVerdict(matched, missing),
    };
  });
}

export async function buildPlanImpl(profile: Profile, gap: GapItem[]): Promise<Plan> {
  const frequency = new Map<string, number>();
  for (const item of gap) {
    for (const skill of item.missing_skills) {
      const key = norm(skill);
      if (!key) continue;
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  const focus = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([skill]) => skill);

  const raw = await jsonCompletion(
    "build_plan",
    "You design short, practical upskilling plans for Lebanese computer science graduates. Be terse: at most 2 resources per week, each week's deliverable at most 40 words, each goal one short sentence, portfolio description at most 60 words. Never infer gender from a name; use the candidate's name or \"they\". Reply with JSON only.",
    `Candidate: ${profile.name}, ${profile.level}, ${profile.years_experience} years, ${profile.location}. Skills: ${[...profile.skills, ...profile.inferred_skills].slice(0, 15).join(", ")}.\nMissing skills across the top matches: ${JSON.stringify(
      [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s),
    )}\n\nThe three focus skills (already computed by frequency) are: ${JSON.stringify(focus)}.\nReturn JSON {"focus_skills":string[3],"weeks":[{"week":1..4,"goal":string,"resources":string[] (max 2),"deliverable":string (max 40 words)}],"portfolio_project":{"title":string,"description":string (max 60 words),"why_it_closes_the_gap":string (max 40 words)}} with exactly 4 weeks.`,
  );

  const clampWords = (text: string, max: number) => {
    const words = text.trim().split(/\s+/);
    return words.length <= max ? text.trim() : `${words.slice(0, max).join(" ")}…`;
  };
  const weeks = (Array.isArray(raw.weeks) ? raw.weeks : []).slice(0, 4).map((week: any, i: number) => ({
    week: Number(week.week ?? i + 1) || i + 1,
    goal: String(week.goal ?? ""),
    resources: Array.isArray(week.resources) ? week.resources.map(String).slice(0, 2) : [],
    deliverable: clampWords(String(week.deliverable ?? ""), 40),
  }));

  return {
    focus_skills: Array.isArray(raw.focus_skills) && raw.focus_skills.length
      ? raw.focus_skills.slice(0, 3).map(String)
      : focus,
    weeks,
    portfolio_project: {
      title: String(raw.portfolio_project?.title ?? ""),
      description: clampWords(String(raw.portfolio_project?.description ?? ""), 60),
      why_it_closes_the_gap: clampWords(String(raw.portfolio_project?.why_it_closes_the_gap ?? ""), 40),
    },
  };
}

/* -------------------------------- re-ranking ------------------------------- */

export function buildProfileQuery(profile: Profile): string {
  return sanitizeQuery([
    profile.preferred_roles.join(", ") || "software engineer",
    `${profile.level} level`,
    `${profile.years_experience} years of experience`,
    profile.location ? `based in ${profile.location}` : "",
    `key skills: ${[...profile.skills, ...profile.inferred_skills].slice(0, 8).join(", ")}`,
  ]
    .filter(Boolean)
    .join(". "));
}

/** Merge search attempts into a pool, keeping the highest score per job. */
export function mergePool(pool: JobMatch[], found: JobMatch[]): JobMatch[] {
  const byId = new Map(pool.map((job) => [job.job_id, job]));
  for (const job of found) {
    const existing = byId.get(job.job_id);
    if (!existing || job.score > existing.score) byId.set(job.job_id, { ...existing, ...job });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/** Preference bonuses replace hard retrieval filters. Tiered location fit. */
export function locationBonus(job: JobMatch, profile: Profile | null): number {
  const parts = String(profile?.location ?? "")
    .split(/[,/(]/)
    .map((p) => norm(p))
    .filter(Boolean);
  const city = parts[0] ?? "";
  const country = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  const jobLocation = norm(job.location ?? "");
  const candidateInLebanon = country.includes("lebanon") || parts.includes("lebanon");
  const remote = norm(job.work_mode ?? "").includes("remote") || jobLocation.includes("remote");
  if (city && jobLocation && jobLocation.includes(city)) return 1;
  if (country && jobLocation && jobLocation.includes(country)) return 0.95;
  if (candidateInLebanon && jobLocation.includes("lebanon")) return 0.95;
  if (remote && jobLocation.includes("lebanon")) return 0.9;
  if (remote && (jobLocation.includes("mena") || jobLocation.includes("middle east"))) return 0.75;
  if (remote) return 0.45;
  return 0.05;
}

const SENIORITY_LADDER = ["intern", "junior", "mid-level", "senior", "lead"];

function ladderIndex(value: string): number {
  const v = norm(value).replace(/\s+/g, "-").replace("mid", "mid").replace("midlevel", "mid-level");
  const exact = SENIORITY_LADDER.indexOf(v);
  if (exact >= 0) return exact;
  if (v.startsWith("intern")) return 0;
  if (v.startsWith("junior") || v.startsWith("entry")) return 1;
  if (v.startsWith("mid")) return 2;
  if (v.startsWith("senior")) return 3;
  if (v.startsWith("lead") || v.startsWith("staff") || v.startsWith("principal")) return 4;
  return -1;
}

export function seniorityBonus(job: JobMatch, profile: Profile | null): number {
  const candidate = ladderIndex(profile?.level ?? "");
  const jobLevel = ladderIndex(job.seniority ?? "");
  if (candidate < 0 || jobLevel < 0) return 0.2;
  const years = profile?.years_experience ?? 0;
  if (job.min_years > years + 0.5) return 0.05;
  // Over-levelled candidates must not be topped by intern roles.
  if (candidate >= 2 && jobLevel === 0) return 0.1;
  const distance = Math.abs(candidate - jobLevel);
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.2;
}

export function domainBonus(job: JobMatch, profile: Profile | null): number {
  const candidateTerms = [
    ...(profile?.preferred_roles ?? []),
    ...(profile?.domains ?? []),
    ...(profile?.skills ?? []).slice(0, 12),
    ...(profile?.inferred_skills ?? []).slice(0, 5),
  ]
    .flatMap((value) => canonicalSkill(value).split(/\s+/))
    .filter((value) => value.length >= 3);
  if (candidateTerms.length === 0) return 0.5;
  const jobText = canonicalSkill(`${job.title} ${job.required_skills}`);
  const hits = new Set(candidateTerms.filter((term) => jobText.includes(term))).size;
  return Math.min(1, hits / Math.min(4, new Set(candidateTerms).size));
}

export function rerank(jobs: JobMatch[], gap: GapItem[], profile: Profile | null = null): JobMatch[] {
  const readiness = new Map(gap.map((item) => [item.job_id, item.readiness_score]));
  const retrievalOrder = new Map(jobs.map((job, index) => [job.job_id, index + 1]));

  const scored = jobs.map((job) => {
    // Cosine similarity is already on a comparable 0..1 scale. Min-max scaling
    // exaggerated tiny retrieval differences and drowned out location/seniority fit.
    const normalized = Math.max(0, Math.min(1, job.score));
    const ready = readiness.get(job.job_id) ?? 0;
    const locBonus = locationBonus(job, profile);
    const senBonus = seniorityBonus(job, profile);
    const roleBonus = domainBonus(job, profile);
    return {
      ...job,
      normalized_score: normalized,
      readiness_score: ready,
      location_bonus: locBonus,
      seniority_bonus: senBonus,
      domain_bonus: roleBonus,
      final_score: 0.35 * normalized + 0.2 * (ready / 100) + 0.25 * locBonus + 0.15 * senBonus + 0.05 * roleBonus,
      retrieval_rank: retrievalOrder.get(job.job_id) ?? 0,
    };
  });

  scored.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
  return scored.map((job, index) => ({
    ...job,
    final_rank: index + 1,
    rank_delta: (job.retrieval_rank ?? index + 1) - (index + 1),
  }));
}

function toRanking(jobs: JobMatch[], scoreKey: "score" | "final_score"): RankingEntry[] {
  return jobs.map((job, index) => ({
    job_id: job.job_id,
    title: job.title,
    company: job.company,
    rank: index + 1,
    score: Number(job[scoreKey] ?? 0),
  }));
}

/* ------------------------------- orchestrator ------------------------------ */

/**
 * The tool sequence is fixed (parse_cv -> search_jobs -> reflect_on_results ->
 * optional one retry -> analyze_gap -> build_plan) and was already enforced with
 * deterministic fallbacks, so the pipeline is driven from code. Letting the model
 * route each step cost 4-6 extra round-trips (~15s) that produced no content, and
 * made runs non-reproducible.
 */
const MAX_RETRIES = 1;
const RETRIEVE_K = 10;

export type AgentResult = {
  result_version: 2;
  run_id: string;
  candidate_id: string;
  profile: Profile | null;
  top_matches: JobMatch[];
  retrieval_ranking: RankingEntry[];
  reranked_ranking: RankingEntry[];
  gap: GapItem[];
  plan: Plan | null;
  retries: number;
  latency_ms: number;
  low_confidence: boolean;
};

export async function runAgentImpl(cvText: string): Promise<AgentResult> {
  const startedAt = Date.now();
  let retries = 0;
  let stepNumber = 0;

  let profile: Profile | null = null;
  let matches: JobMatch[] = [];
  let gap: GapItem[] = [];
  let plan: Plan | null = null;
  let pendingRevisedQuery: string | null = null;
  let reflectionDone = false;

  async function record<T>(tool: string, input: string, fn: () => Promise<T>, summarize: (out: T) => string) {
    void tool;
    void input;
    void summarize;
    stepNumber += 1;
    return fn();
  }

  async function searchWithDiagnostics(query: string, label: string): Promise<JobMatch[]> {
    const diagnostics: { warning?: string } = {};
    const found = await record(
      "search_jobs",
      `top_k=${RETRIEVE_K}, query="${query}"${label}`,
      () => searchJobsImpl(query, RETRIEVE_K, diagnostics),
      (jobs) => `${jobs.length} results, top score ${(jobs[0]?.score ?? 0).toFixed(3)}`,
    );
    if (diagnostics.warning) console.warn(diagnostics.warning);
    return found;
  }

  async function runReflection(): Promise<Reflection> {
    if (reflectionDone) {
      return { sufficient: true, reason: "Reflection already ran once for this run.", revised_query: null };
    }
    const topScore = matches[0]?.score ?? 0;
    if (topScore >= 0.7) {
      reflectionDone = true;
      pendingRevisedQuery = null;
      return {
        sufficient: true,
        reason: `reflection skipped: strong retrieval (score ${topScore.toFixed(3)})`,
        revised_query: null,
      };
    }
    reflectionDone = true;
    const reflection = await record(
      "reflect_on_results",
      `${matches.length} pooled results, top score ${(matches[0]?.score ?? 0).toFixed(3)}`,
      () => reflectOnResultsImpl(profile as Profile, matches),
      (r) => `${r.sufficient ? "sufficient" : "insufficient"} — ${r.reason}${r.revised_query ? ` | revised query: ${r.revised_query}` : ""}`,
      );
    // A retry may only ADD candidates; it needs a named, fixable problem and a usable query.
    const verdict: Reflection =
      !reflection.sufficient && reflection.revised_query && reflection.reason.trim().length > 10
        ? reflection
        : { sufficient: true, reason: reflection.reason, revised_query: null };
    pendingRevisedQuery = verdict.sufficient ? null : verdict.revised_query;
    return verdict;
  }

  // 1. Parse the CV.
  profile = await record("parse_cv", `cv_text (${cvText.length} chars)`, () => parseCvImpl(cvText), (p) =>
    `${p.name}, ${p.level}, ${p.years_experience}y, ${p.skills.length} skills, ${p.inferred_skills.length} inferred`,
  );

  // 2. Retrieve.
  matches = mergePool(matches, await searchWithDiagnostics(sanitizeQuery(buildProfileQuery(profile)), ""));

  // 3. Reflect once, and retry at most once when it names a fixable problem.
  if (matches.length === 0) {
    // fall back to a profile-derived query
    matches = mergePool(matches, await searchWithDiagnostics(buildProfileQuery(profile), " (fallback)"));
  }
  if (!reflectionDone) {
    await runReflection();
    if (pendingRevisedQuery && retries < MAX_RETRIES) {
      const revised = pendingRevisedQuery;
      pendingRevisedQuery = null;
      retries += 1;
      const retried = await searchWithDiagnostics(revised, " (reflection retry)");
      matches = mergePool(matches, retried);
    }
  }
  // The ranked set is fixed here: exactly the jobs that get a gap assessment are
  // the jobs that get re-ranked and shown, so readiness can never default to 0.
  const rankedPool = matches.slice(0, RETRIEVE_K);
  const assessed = new Set(gap.map((item) => item.job_id));
  const uncovered = rankedPool.filter((job) => !assessed.has(job.job_id));
  if (uncovered.length > 0) {
    const extra = await record(
      "analyze_gap",
      `gap coverage top-up for ${uncovered.length} pooled jobs`,
      () => analyzeGapImpl(profile as Profile, uncovered),
      (items) => `${items.length} additional assessments`,
    );
    gap = [...gap, ...extra];
  }
  // Drop assessments for jobs that are no longer in the ranked set and order them
  // like the retrieval ranking so the UI and the report agree.
  const poolOrder = new Map(rankedPool.map((job, index) => [job.job_id, index]));
  const seenGap = new Set<string>();
  gap = gap
    .filter((item) => poolOrder.has(item.job_id) && !seenGap.has(item.job_id) && seenGap.add(item.job_id) !== null)
    .sort((a, b) => (poolOrder.get(a.job_id) ?? 0) - (poolOrder.get(b.job_id) ?? 0));

  const retrievalRanking = toRanking(rankedPool, "score");
  const reranked = rerank(rankedPool, gap, profile);
  const rerankedRanking = toRanking(reranked, "final_score");
  const topMatches = reranked.slice(0, 5);
  const topIds = new Set(topMatches.map((job) => job.job_id));
  gap = topMatches
    .map((job) => gap.find((item) => item.job_id === job.job_id))
    .filter((item): item is GapItem => Boolean(item));
  if (gap.length !== topIds.size) throw new Error("A ranked role is missing its deterministic gap assessment.");
  plan = await record(
    "build_plan",
    `focus from ${gap.length} displayed gap assessments`,
    () => buildPlanImpl(profile as Profile, gap),
    (p) => `focus: ${p.focus_skills.join(", ")}; ${p.weeks.length} weeks`,
  );
  const lowConfidence = (topMatches[0]?.readiness_score ?? 0) < 25;
  const latency = Date.now() - startedAt;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cvId = `cv_${Date.now().toString(36)}`;
  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from("candidates")
    .insert({ cv_id: cvId, name: profile.name, raw_text: cvText, parsed: profile as any })
    .select("id")
    .single();
  if (candidateError) throw new Error(candidateError.message);

  const { data: run, error: runError } = await supabaseAdmin
    .from("agent_runs")
    .insert({
      candidate_id: candidate.id,
      mode: "vector",
      top_matches: topMatches as any,
      retrieval_ranking: retrievalRanking as any,
      reranked_ranking: rerankedRanking as any,
      gap: gap as any,
      plan: plan as any,
      latency_ms: latency,
      retries,
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  return {
    result_version: 2,
    run_id: run.id,
    candidate_id: candidate.id,
    profile,
    top_matches: topMatches,
    retrieval_ranking: retrievalRanking,
    reranked_ranking: rerankedRanking,
    gap,
    plan,
    retries,
    latency_ms: latency,
    low_confidence: lowConfidence,
  };
}
