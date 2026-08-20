import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { runAgent } from "@/lib/agent.functions";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfText, loadPdfjs } from "@/lib/pdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Run the Career Agent | TalentBridge Lebanon" },
      {
        name: "description",
        content:
          "Upload a CV and let the AI career agent parse it, retrieve matching roles semantically and build a personalised upskilling plan.",
      },
      { property: "og:title", content: "Run the Career Agent | TalentBridge Lebanon" },
      {
        property: "og:description",
        content: "An AI matching agent for Lebanese computer science graduates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const [cvText, setCvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const run = useServerFn(runAgent);

  const { data: samples } = useQuery({
    queryKey: ["sample_cvs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eval_cvs")
        .select("cv_id, name, track, level, is_eval, raw_text")
        .order("cv_id");
      if (error) throw error;
      return data;
    },
  });

  // Warm the PDF engine while the user is still choosing a file.
  useEffect(() => {
    void loadPdfjs().catch(() => undefined);
  }, []);

  const agentMutation = useMutation({
    mutationFn: async () => run({ data: { cv_text: cvText } }),
    onSuccess: (result) => {
      try {
        sessionStorage.setItem("talentbridge:last-run", JSON.stringify(result));
        sessionStorage.removeItem("talentbridge:cleared");
        sessionStorage.setItem(
          "talentbridge:last-cv",
          JSON.stringify({ cv_id: sampleId, text: cvText, name: result.profile?.name ?? "" }),
        );
      } catch {
        /* ignore storage failures */
      }
      void navigate({ to: "/results" });
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : "Matching failed. Please try again."),
  });

  async function handleFile(file: File) {
    setError(null);
    setSampleId(null);
    setFileName(file.name);
    setExtracting(true);
    try {
      const text =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
          ? await extractPdfText(file)
          : await file.text();
      setCvText(text);
      if (!text.trim()) setError("No text could be extracted from this file.");
    } catch {
      setError("This file could not be read. Try a text-based PDF or paste the CV below.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-14">
      <PageHeader
        title="Run the career agent"
        description="Upload a PDF or paste a CV. The agent parses the profile, retrieves roles by semantic similarity over the embedded job index, analyses skill gaps and drafts a 4-week upskilling plan."
      />

      <form className="mt-10 space-y-8" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="sample-cv" className="block text-sm font-medium text-foreground">
            Sample CV
          </label>
          <select
            id="sample-cv"
            defaultValue=""
            onChange={(event) => {
              const sample = samples?.find((item) => item.cv_id === event.target.value);
              if (!sample) return;
              setError(null);
              setFileName(`${sample.cv_id} — ${sample.name}`);
              setSampleId(sample.cv_id);
              setCvText(sample.raw_text);
            }}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">Choose a benchmark CV…</option>
            {(samples ?? []).map((sample) => (
              <option key={sample.cv_id} value={sample.cv_id}>
                {sample.cv_id} · {sample.name}
                {sample.track ? ` · ${sample.track} (${sample.level})` : " · adversarial demo"}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Pick a labelled benchmark profile to try the agent, or upload your own CV below.
          </p>
        </div>

        <div>
          <label htmlFor="cv-file" className="block text-sm font-medium text-foreground">
            CV file (PDF)
          </label>
          <input
            id="cv-file"
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="mt-2 block w-full cursor-pointer rounded-md border border-border px-3 py-2 text-sm text-muted-foreground file:mr-4 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {extracting
              ? "Extracting text…"
              : fileName
                ? `${fileName} — ${cvText.length.toLocaleString()} characters extracted`
                : "Text is extracted in your browser; nothing is stored until you start matching."}
          </p>
        </div>

        <div>
          <label htmlFor="cv-text" className="block text-sm font-medium text-foreground">
            CV text
          </label>
          <textarea
            id="cv-text"
            value={cvText}
            onChange={(event) => {
              setSampleId(null);
              setCvText(event.target.value);
            }}
            rows={12}
            placeholder="Paste the CV contents here"
            className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {cvText.length.toLocaleString()} characters
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-4">
          <Button
            type="button"
            disabled={cvText.trim().length < 20 || agentMutation.isPending}
            onClick={() => {
              setError(null);
              agentMutation.mutate();
            }}
          >
            {agentMutation.isPending ? "Agent running…" : "Run agent to match my CV"}
          </Button>
          {agentMutation.isPending ? (
            <p className="text-sm text-muted-foreground">
               Parsing the CV, retrieving roles, computing verified skill gaps, re-ranking, then generating the plan.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
               Semantic retrieval over 180 embedded roles, deterministic skill-gap analysis and fit-aware re-ranking.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
