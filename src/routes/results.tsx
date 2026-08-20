import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import type { AgentResult } from "@/lib/agent.server";
import { buildReport, downloadReport } from "@/lib/report";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Agent Results | TalentBridge Lebanon" },
      {
        name: "description",
        content:
          "Agent output: ranked role matches, skill-gap analysis and a generated 4-week upskilling plan.",
      },
      { property: "og:title", content: "Agent Results | TalentBridge Lebanon" },
      {
        property: "og:description",
        content: "AI agent output: ranked role matches and skill-gap analysis for Lebanese CS graduates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ResultsPage() {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Results are per-visit only: never fall back to another visitor's run.
    try {
      if (sessionStorage.getItem("talentbridge:cleared") !== "1") {
        const cached = sessionStorage.getItem("talentbridge:last-run");
        if (cached) {
          const parsed = JSON.parse(cached) as AgentResult;
          // Older cached runs can contain independently generated gap prose.
          // Never present stale, internally inconsistent results after this fix.
          if (parsed.result_version === 2) setResult(parsed);
          else sessionStorage.removeItem("talentbridge:last-run");
        }
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 py-14">
        <PageHeader title="Agent results" description="Loading the latest agent run." />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 py-14">
        <PageHeader title="Agent results" description="Ranked role matches produced by the career agent." />
        <div className="mt-10 rounded-lg border border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">No agent run yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            <Link to="/" className="text-primary underline-offset-4 hover:underline">
              Run the agent on a CV
            </Link>{" "}
            to see your matches here.
          </p>
        </div>
      </div>
    );
  }

  const { profile, top_matches, gap, plan } = result;
  const displayMatches = top_matches.slice(0, 5);
  const totalMatched = result.reranked_ranking?.length ?? displayMatches.length;
  const readiness = new Map(gap.map((item) => [item.job_id, item]));
  // Titles come from the rankings too — a job id must never surface as a title.
  const jobLabels = new Map<string, string>();
  for (const entry of [
    ...(result.retrieval_ranking ?? []),
    ...(result.reranked_ranking ?? []),
    ...displayMatches,
  ]) {
    if (entry.title) jobLabels.set(entry.job_id, `${entry.title} · ${entry.company}`);
  }
  const showNotice = result.low_confidence;

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-14">
      <PageHeader
        title="Agent results"
        description={`The agent parsed the CV, retrieved and re-ranked ${totalMatched} roles in ${(result.latency_ms / 1000).toFixed(1)}s. Showing the top 5.`}
      />

      {showNotice ? (
        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium text-foreground">The agent flagged these matches as a partial fit</p>
          <p className="mt-1 text-muted-foreground">
            The CV covers few of the skills these roles ask for. Adding more detail about projects and
            tools usually improves the match.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => downloadReport(result)}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Download report
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(buildReport(result));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {copied ? "Copied" : "Copy report"}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.removeItem("talentbridge:last-run");
              sessionStorage.removeItem("talentbridge:current-cv");
              sessionStorage.removeItem("talentbridge:current-cv-id");
              sessionStorage.setItem("talentbridge:cleared", "1");
            } catch {
              /* ignore */
            }
            setResult(null);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-destructive hover:bg-muted"
        >
          Clear results
        </button>
      </div>

      {profile ? (
        <Section title="Profile parsed by the agent">
          <div className="rounded-lg border border-border p-5 text-sm">
            <p className="font-medium text-foreground">
              {profile.name} — {profile.level} · {Math.round(profile.years_experience * 10) / 10} years
            </p>
            <p className="mt-2 text-muted-foreground">{profile.summary}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Education</dt>
                <dd className="mt-1 text-foreground">{profile.education || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
                <dd className="mt-1 text-foreground">{profile.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Preferred roles</dt>
                <dd className="mt-1 text-foreground">{profile.preferred_roles.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Domains</dt>
                <dd className="mt-1 text-foreground">{profile.domains.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Skills</dt>
                <dd className="mt-1 text-foreground">{profile.skills.join(", ") || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Inferred skills</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {profile.inferred_skills?.length ? (
                    profile.inferred_skills.map((skill) => {
                      const evidence = profile.inferred_skills_detail?.find(
                        (entry) => entry.skill === skill,
                      )?.evidence;
                      return (
                        <span
                          key={skill}
                          title={evidence ? `Evidence: ${evidence}` : undefined}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-foreground"
                        >
                          {skill}
                          <span className="text-[10px] uppercase tracking-wide text-primary">inferred</span>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-foreground">—</span>
                  )}
                </dd>
                {profile.inferred_skills_detail?.length ? (
                  <dd className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {profile.inferred_skills_detail.map((entry) => (
                      <p key={entry.skill}>
                        <span className="text-foreground">{entry.skill}</span> — {entry.evidence}
                      </p>
                    ))}
                  </dd>
                ) : null}
              </div>
            </dl>
          </div>
        </Section>
      ) : null}

      <Section title="Top 5 matched roles">
        <ul className="space-y-3">
          {displayMatches.map((job) => {
            const item = readiness.get(job.job_id);
            const match = Math.round(
              (job.final_score ?? job.normalized_score ?? job.score) * 100,
            );
            return (
              <li key={job.job_id} className="rounded-lg border border-border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {job.final_rank ?? "—"}. {job.title} · {job.company}
                  </p>
                  <p className="text-xs text-muted-foreground">Match {match}%</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job.location} ({job.work_mode}) · {job.seniority} · {job.min_years}+ years
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{job.required_skills}</p>
                {item ? (
                  <p className="mt-2 text-sm text-foreground">{item.one_line_verdict}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Agent gap analysis for the top 5 matches">
        <ul className="space-y-3">
          {displayMatches
            .map((job) => readiness.get(job.job_id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item, index) => {
              const label = jobLabels.get(item.job_id) ?? "Matched role";
              const rank = index + 1;
              const ordinal =
                rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
              return (
                <li key={item.job_id} className="rounded-lg border border-border p-5 text-sm">
                  <p className="font-medium text-foreground">
                    For the {ordinal} top match: {label}
                  </p>
                  <p className="mt-3 text-muted-foreground">
                    <span className="text-foreground">Skills matched:</span>{" "}
                    {item.matched_skills.join(", ") || "—"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="text-foreground">Skills missing:</span>{" "}
                    {item.missing_skills.join(", ") || "—"}
                  </p>
                  {item.one_line_verdict ? (
                    <p className="mt-3 text-foreground">{item.one_line_verdict}</p>
                  ) : null}
                </li>
              );
            })}
        </ul>
      </Section>

      {plan ? (
        <Section title="Agent-generated 4-week upskilling plan">
          <p className="text-sm text-muted-foreground">
            Focus skills: {plan.focus_skills.join(", ") || "—"}
          </p>
          <ol className="mt-4 space-y-3">
            {plan.weeks.map((week) => (
              <li key={week.week} className="rounded-lg border border-border p-5 text-sm">
                <p className="font-medium text-foreground">Week {week.week} — {week.goal}</p>
                <p className="mt-2 text-muted-foreground">Resources: {week.resources.join(", ") || "—"}</p>
                <p className="mt-1 text-muted-foreground">Deliverable: {week.deliverable}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-border p-5 text-sm">
            <p className="font-medium text-foreground">
              Portfolio project — {plan.portfolio_project.title}
            </p>
            <p className="mt-2 text-muted-foreground">{plan.portfolio_project.description}</p>
            <p className="mt-1 text-muted-foreground">{plan.portfolio_project.why_it_closes_the_gap}</p>
          </div>
        </Section>
      ) : null}

    </div>
  );
}
