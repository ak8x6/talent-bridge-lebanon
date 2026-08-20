export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0]!.map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

const TEXT_COLUMNS = [
  "job_id",
  "title",
  "company",
  "location",
  "work_mode",
  "seniority",
  "employment_type",
  "track",
  "required_skills",
  "description",
] as const;

export type JobInsert = {
  job_id?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  work_mode?: string | null;
  seniority?: string | null;
  min_years?: number | null;
  employment_type?: string | null;
  track?: string | null;
  required_skills?: string | null;
  description?: string | null;
};

const normalize = (key: string) => key.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function mapRowsToJobs(rows: CsvRow[]): JobInsert[] {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalize(key)] = value;
    }

    const job: JobInsert = {};
    for (const column of TEXT_COLUMNS) {
      const value = normalized[column];
      if (value !== undefined && value !== "") job[column] = value;
    }

    const years = normalized["min_years"];
    if (years !== undefined && years !== "") {
      const parsed = Number.parseInt(years, 10);
      job.min_years = Number.isNaN(parsed) ? null : parsed;
    }

    return job;
  });
}

export const JOB_COLUMNS = [...TEXT_COLUMNS, "min_years"] as const;