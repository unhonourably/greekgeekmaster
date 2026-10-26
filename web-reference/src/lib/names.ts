const GREEK: Array<[string, string]> = [
  ["α", "alpha"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"], ["ε", "epsilon"], ["ζ", "zeta"],
  ["η", "eta"], ["θ", "theta"], ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu"],
  ["ν", "nu"], ["ξ", "xi"], ["ο", "omicron"], ["π", "pi"], ["ρ", "rho"], ["σ", "sigma"], ["ς", "sigma"],
  ["τ", "tau"], ["υ", "upsilon"], ["φ", "phi"], ["χ", "chi"], ["ψ", "psi"], ["ω", "omega"],
];

const STOP_WORDS = /\b(the|chapter|of|at|fraternity|sorority|inc|incorporated|colony)\b/g;

export function normalizeChapterName(value: string): string {
  let v = value.toLowerCase();
  for (const [letter, name] of GREEK) v = v.split(letter).join(` ${name} `);
  return v
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(STOP_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  return email.slice(at + 1).toLowerCase();
}

export function domainMatches(email: string, allowedDomains: readonly string[]): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((allowed) => {
    const a = allowed.toLowerCase().replace(/^@/, "");
    return domain === a || domain.endsWith(`.${a}`);
  });
}
