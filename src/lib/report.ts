import type { AgentResult } from "./agent.server";

/** Builds a plain-text / Markdown report of an agent run for download or copy-paste. */
export function buildReport(result: AgentResult): string {
  const { profile, top_matches, gap, plan } = result;
  const displayMatches = top_matches.slice(0, 5);
  const totalMatched = result.reranked_ranking?.length ?? displayMatches.length;
  const lines: string[] = [];
  const push = (...values: string[]) => lines.push(...values);

  push("# Agent results", "");
  push(
    `The agent parsed the CV, retrieved and re-ranked ${totalMatched} roles in ${(result.latency_ms / 1000).toFixed(1)}s. Showing the top 5.`,
    "",
  );

  if (result.low_confidence) {
    push(
      "> **The agent flagged these matches as a partial fit**",
      ">",
      "> The CV covers few of the skills these roles ask for. Adding more detail about projects and tools usually improves the match.",
      "",
    );
  }

  if (profile) {
    push("## Profile parsed by the agent", "");
    push(`**${profile.name}** — ${profile.level} · ${Math.round(profile.years_experience * 10) / 10} years`, "");
    if (profile.summary) push(profile.summary, "");
    push(`- Education: ${profile.education || "—"}`);
    push(`- Location: ${profile.location || "—"}`);
    push(`- Preferred roles: ${profile.preferred_roles.join(", ") || "—"}`);
    push(`- Domains: ${profile.domains.join(", ") || "—"}`);
    push(`- Skills: ${profile.skills.join(", ") || "—"}`);
    push(
      `- Inferred skills: ${
        profile.inferred_skills?.length
          ? profile.inferred_skills.map((skill) => `${skill} (inferred)`).join(", ")
          : "—"
      }`,
      "",
    );
    if (profile.inferred_skills_detail?.length) {
      profile.inferred_skills_detail.forEach((entry) =>
        push(`  - ${entry.skill} — ${entry.evidence}`),
      );
      push("");
    }
  }

  push("## Top 5 matched roles", "");
  const readiness = new Map(gap.map((item) => [item.job_id, item]));
  displayMatches.forEach((job) => {
    const item = readiness.get(job.job_id);
    const match = Math.round((job.final_score ?? job.normalized_score ?? job.score) * 100);
    push(`### ${job.final_rank ?? "—"}. ${job.title} · ${job.company}`);
    push(`- Match ${match}%`);
    push(`- ${job.location} (${job.work_mode}) · ${job.seniority} · ${job.min_years}+ years`);
    push(`- ${job.required_skills}`);
    if (item?.one_line_verdict) push(`- ${item.one_line_verdict}`);
    push("");
  });

  push("## Agent gap analysis for the top 5 matches", "");
  const jobLabels = new Map<string, string>();
  for (const entry of [
    ...(result.retrieval_ranking ?? []),
    ...(result.reranked_ranking ?? []),
    ...displayMatches,
  ]) {
    if (entry.title) jobLabels.set(entry.job_id, `${entry.title} · ${entry.company}`);
  }
  const shownGap = displayMatches
    .map((job) => readiness.get(job.job_id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  shownGap.forEach((item, index) => {
    const rank = index + 1;
    const ordinal =
      rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
    push(
      `### For the ${ordinal} top match: ${jobLabels.get(item.job_id) ?? "Matched role"}`,
    );
    push(`- Skills matched: ${item.matched_skills.join(", ") || "—"}`);
    push(`- Skills missing: ${item.missing_skills.join(", ") || "—"}`);
    if (item.one_line_verdict) push(`- Verdict: ${item.one_line_verdict}`);
    push("");
  });

  if (plan) {
    push("## Agent-generated 4-week upskilling plan", "");
    push(`Focus skills: ${plan.focus_skills.join(", ") || "—"}`, "");
    plan.weeks.forEach((week) => {
      push(`### Week ${week.week} — ${week.goal}`);
      push(`- Resources: ${week.resources.join(", ") || "—"}`);
      push(`- Deliverable: ${week.deliverable}`, "");
    });
    push(`### Portfolio project — ${plan.portfolio_project.title}`);
    push(plan.portfolio_project.description, "");
    push(plan.portfolio_project.why_it_closes_the_gap, "");
  }

  return lines.join("\n");
}

export function downloadReport(result: AgentResult) {
  const blob = new Blob([buildReport(result)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `talentbridge-report-${(result.profile?.name ?? "candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
