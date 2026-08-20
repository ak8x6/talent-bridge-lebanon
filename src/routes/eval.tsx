import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { clearEvalHistory, runEvaluation } from "@/lib/eval.functions";
import type { EvalSummary } from "@/lib/eval.server";

const EVAL_RUNS_KEY = "talentbridge:eval-runs";


export const Route = createFileRoute("/eval")({
  head: () => ({
    meta: [
      { title: "Agent Evaluation | TalentBridge Lebanon" },
      {
        name: "description",
        content:
          "Precision@5 benchmark of the AI matching agent's semantic retrieval across 15 labelled benchmark CVs.",
      },
      { property: "og:title", content: "Agent Evaluation | TalentBridge Lebanon" },
      {
        property: "og:description",
        content: "Precision@5 and latency metrics for the TalentBridge AI matching agent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EvalPage,
});

type ResultRow = {
  id: string;
  run_label: string | null;
  cv_id: string | null;
  precision_at_5: number | null;
  latency_ms: number | null;
  hit_ids: unknown;
  created_at: string;
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type StoredRun = EvalSummary & { savedAt: string };

function loadRuns(): StoredRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(EVAL_RUNS_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredRun[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: StoredRun[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(EVAL_RUNS_KEY, JSON.stringify(runs));
}

function EvalPage() {
  const evaluate = useServerFn(runEvaluation);
  const clearHistory = useServerFn(clearEvalHistory);
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setRuns(loadRuns());
  }, []);

  const latest = runs[0] ?? null;
  const history = runs.slice(1);

  const current = latest
    ? {
        count: latest.cv_count,
        precision: latest.mean_precision_at_5,
        latency: latest.mean_latency_ms,
        cv: `${latest.cv_count} CVs`,
      }
    : null;

  async function run() {
    setError(null);
    const label = `run-${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    try {
      setBusy("run");
      const summary = await evaluate({ data: { run_label: label } });
      const stored: StoredRun = { ...summary, savedAt: new Date().toISOString() };
      const next = [stored, ...loadRuns()];
      saveRuns(next);
      setRuns(next);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The evaluation run failed.");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setError(null);
    try {
      setBusy("clear");
      await clearHistory({});
      saveRuns([]);
      setRuns([]);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Clearing the history failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-14">
      <PageHeader
        title="Agent evaluation"
        description="Offline benchmark of the retrieval agent across all labelled benchmark CVs: mean Precision@5 against the ground-truth relevant roles. A retrieved job counts as relevant when its track matches the CV's labelled track and its seniority is compatible with the candidate's level. The label is never exposed to the embedding or retrieval step, so there is no label leakage."
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy !== null} onClick={() => void run()}>
          {busy === "run" ? "Agent evaluating all benchmark CVs…" : "Run agent benchmark across all CVs"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowHistory((value) => !value)}>
          {showHistory ? "Hide previous benchmarks" : "Show previous benchmarks"}
        </Button>
        {showHistory ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || runs.length === 0}
            onClick={() => void clear()}
          >
            {busy === "clear" ? "Clearing…" : "Clear history"}
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Each run parses every labelled CV, retrieves roles semantically and re-ranks them exactly as the live agent does.
      </p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!latest ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No benchmark run yet. Click the button above to run the agent evaluation.
          </p>
        </div>
      ) : null}

      {current ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Mean Precision@5" value={current.precision.toFixed(2)} hint={current.cv} />
          <Stat
            label="Mean latency per CV"
            value={`${current.latency} ms`}
            hint="Parse + embedding + vector search"
          />
          <Stat label="Latest benchmark" value="Complete" hint={latest?.run_label ?? "—"} />
        </div>
      ) : null}

      {showHistory ? (
        <div className="mt-10 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Run label</th>
                <th className="px-4 py-3 font-medium">CVs</th>
                <th className="px-4 py-3 font-medium">Precision@5</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No previous benchmarks recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.run_label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{row.run_label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.cv_count}</td>
                    <td className="px-4 py-3 text-foreground">{row.mean_precision_at_5.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.mean_latency_ms} ms</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(row.savedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
