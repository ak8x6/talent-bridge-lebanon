import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { embedJobsBatch } from "@/lib/embeddings.functions";
import { JOB_COLUMNS, mapRowsToJobs, parseCsv, type JobInsert } from "@/lib/csv";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Job Index | TalentBridge Lebanon" },
      {
        name: "description",
        content: "Import job listings and monitor vector embedding coverage of the agent's job index.",
      },
      { property: "og:title", content: "Job Index | TalentBridge Lebanon" },
      {
        property: "og:description",
        content: "Manage the embedded job index powering the TalentBridge matching agent.",
      },
    ],
  }),
  component: AdminPage,
});

type Parsed = { headers: string[]; jobs: JobInsert[]; fileName: string };

function AdminPage() {
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [embedState, setEmbedState] = useState<{
    running: boolean;
    done: number;
    total: number;
  } | null>(null);
  const runEmbedBatch = useServerFn(embedJobsBatch);

  const counts = useQuery({
    queryKey: ["jobs-counts"],
    queryFn: async () => {
      const total = await supabase.from("jobs").select("*", { count: "exact", head: true });
      if (total.error) throw total.error;
      const embedded = await supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .not("embedding", "is", null);
      if (embedded.error) throw embedded.error;
      const ids = await supabase.from("jobs").select("job_id");
      if (ids.error) throw ids.error;
      const stray = (ids.data ?? [])
        .map((row) => row.job_id ?? "")
        .filter((id) => {
          const match = /^J(\d{4})$/.exec(id);
          if (!match) return true;
          const n = Number(match[1]);
          return n < 1 || n > 180;
        })
        .sort();
      return { total: total.count ?? 0, embedded: embedded.count ?? 0, stray };
    },
  });

  const importMutation = useMutation({
    mutationFn: async (jobs: JobInsert[]) => {
      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < jobs.length; i += chunkSize) {
        const chunk = jobs.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("jobs")
          .upsert(chunk, { onConflict: "job_id", ignoreDuplicates: false });
        if (error) throw error;
        inserted += chunk.length;
      }
      return inserted;
    },
    onSuccess: (inserted) => {
      setErrorMessage(null);
      setMessage(`Imported ${inserted} row${inserted === 1 ? "" : "s"} into jobs.`);
      setParsed(null);
      void queryClient.invalidateQueries({ queryKey: ["jobs-counts"] });
    },
    onError: (error: Error) => {
      setMessage(null);
      setErrorMessage(error.message);
    },
  });

  const embedMutation = useMutation({
    mutationFn: async () => {
      setMessage(null);
      setErrorMessage(null);
      const startingRemaining = (counts.data?.total ?? 0) - (counts.data?.embedded ?? 0);
      let total = Math.max(startingRemaining, 0);
      let done = 0;
      setEmbedState({ running: true, done, total });

      for (;;) {
        const result = await runEmbedBatch({});
        done += result.processed;
        total = Math.max(total, done + result.remaining);
        setEmbedState({ running: true, done, total });
        void queryClient.invalidateQueries({ queryKey: ["jobs-counts"] });
        if (result.remaining === 0) break;
        if (result.processed === 0) {
          throw new Error("Embedding stalled with rows still pending.");
        }
      }

      setEmbedState((prev) => (prev ? { ...prev, running: false } : null));
      return done;
    },
    onSuccess: (done) => {
      setMessage(
        done === 0
          ? "All jobs already have embeddings."
          : `Generated embeddings for ${done} job${done === 1 ? "" : "s"}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["jobs-counts"] });
    },
    onError: (error: Error) => {
      setEmbedState((prev) => (prev ? { ...prev, running: false } : null));
      setErrorMessage(error.message);
    },
  });

  async function handleFile(file: File) {
    setMessage(null);
    setErrorMessage(null);
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (headers.length === 0 || rows.length === 0) {
      setParsed(null);
      setErrorMessage("That file has no readable rows.");
      return;
    }
    setParsed({ headers, jobs: mapRowsToJobs(rows), fileName: file.name });
  }

  const recognized = parsed
    ? parsed.headers.filter((h) =>
        (JOB_COLUMNS as readonly string[]).includes(
          h.trim().toLowerCase().replace(/[\s-]+/g, "_"),
        ),
      )
    : [];
  const ignored = parsed ? parsed.headers.filter((h) => !recognized.includes(h)) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-14">
      <PageHeader
        title="Job index"
        description="The retrieval corpus behind the agent: import roles and keep their vector embeddings up to date."
      />

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <StatCard label="Roles in index" value={counts.data?.total} loading={counts.isLoading} />
        <StatCard
          label="Roles vectorised"
          value={counts.data?.embedded}
          loading={counts.isLoading}
        />
      </section>

      <section className="mt-4 rounded-lg border border-border p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Dataset check (expected J0001–J0180)
        </p>
        {counts.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Checking…</p>
        ) : counts.data && counts.data.stray.length > 0 ? (
          <p className="mt-2 text-sm text-destructive">
            {counts.data.stray.length} job_id{counts.data.stray.length === 1 ? "" : "s"} outside
            J0001–J0180: {counts.data.stray.join(", ")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            All job_ids are within J0001–J0180.
          </p>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground">Import jobs from CSV</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Columns are matched by header name. Recognised headers: {JOB_COLUMNS.join(", ")}.
          Rows are matched on job_id, so re-importing updates existing jobs.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="mt-5 block w-full cursor-pointer rounded-md border border-border px-3 py-2 text-sm text-muted-foreground file:mr-4 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />

        {parsed ? (
          <div className="mt-5 rounded-md border border-border bg-secondary/40 p-4 text-sm">
            <p className="text-foreground">
              {parsed.fileName} — {parsed.jobs.length} row
              {parsed.jobs.length === 1 ? "" : "s"} ready
            </p>
            <p className="mt-2 text-muted-foreground">
              Mapped columns: {recognized.length > 0 ? recognized.join(", ") : "none"}
            </p>
            {ignored.length > 0 ? (
              <p className="mt-1 text-muted-foreground">Ignored columns: {ignored.join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => parsed && importMutation.mutate(parsed.jobs)}
            disabled={!parsed || importMutation.isPending}
          >
            {importMutation.isPending ? "Importing" : "Import rows"}
          </Button>
        </div>

        <div className="mt-6 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground">Vector embeddings</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Encodes each role into a 384-dimension embedding from its title, company, seniority,
            experience, location and skills — the vectors the agent searches at match time. The
            ground-truth track label is never included, so the benchmark stays leakage-free.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => embedMutation.mutate()}
              disabled={embedMutation.isPending}
            >
              {embedMutation.isPending ? "Embedding…" : "Generate embeddings"}
            </Button>
            {embedState ? (
              <span className="text-sm tabular-nums text-muted-foreground">
                {embedState.done} / {embedState.total} embedded
              </span>
            ) : null}
          </div>
          {embedState ? (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${embedState.total > 0 ? Math.min(100, (embedState.done / embedState.total) * 100) : 100}%`,
                }}
              />
            </div>
          ) : null}
        </div>

        {message ? <p className="mt-4 text-sm text-primary">{message}</p> : null}
        {errorMessage ? (
          <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
        ) : null}
      </section>

    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
        {loading ? "—" : (value ?? 0)}
      </p>
    </div>
  );
}