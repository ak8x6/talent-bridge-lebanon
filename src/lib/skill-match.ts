const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  react: ["reactjs", "react.js"],
  "next.js": ["nextjs", "next js"],
  "node.js": ["nodejs", "node js"],
  "tailwind css": ["tailwind", "tailwindcss"],
  "scikit-learn": ["sklearn", "scikit learn"],
  "machine learning": ["ml"],
  "deep learning": ["dl"],
  "natural language processing": ["nlp"],
  "computer vision": ["cv"],
  "ci/cd": ["continuous integration", "continuous delivery", "continuous deployment"],
  "amazon web services": ["aws"],
  "google cloud platform": ["gcp"],
};

export function canonicalSkill(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[().]/g, " ")
    .replace(/[^a-z0-9+#/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    if (clean === canonical || aliases.includes(clean)) return canonical;
  }
  return clean;
}

export function requirementsOf(requiredSkills: string | null | undefined): string[] {
  const seen = new Set<string>();
  return String(requiredSkills ?? "")
    .split(/[,;/|]|\band\b/i)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill) => {
      const key = canonicalSkill(skill);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function assessSkills(
  requiredSkills: string | null | undefined,
  explicitSkills: string[],
  inferredSkills: string[] = [],
) {
  const possessed = new Set(
    [...explicitSkills, ...inferredSkills].map(canonicalSkill).filter(Boolean),
  );
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of requirementsOf(requiredSkills)) {
    (possessed.has(canonicalSkill(skill)) ? matched : missing).push(skill);
  }
  const total = matched.length + missing.length;
  return {
    matched,
    missing,
    readiness: total === 0 ? 0 : Math.round((100 * matched.length) / total),
  };
}

export function deterministicSkillVerdict(matched: string[], missing: string[]): string {
  const total = matched.length + missing.length;
  if (total === 0) return "This role does not list enough skill requirements to assess reliably.";
  if (missing.length === 0) return `The CV demonstrates all ${total} listed skill requirements for this role.`;
  if (matched.length === 0) return `The CV does not yet demonstrate any of this role's ${total} listed skill requirements.`;
  const verb = missing.length === 1 ? "remains" : "remain";
  return `The CV demonstrates ${matched.length} of this role's ${total} listed skill requirements; ${missing.length} ${verb} to develop.`;
}