export type RecommendedPick = { domain: string; name?: string } | { name: string; domain?: undefined };
export type RecommendedRegion = { region: string; schools: RecommendedPick[] };

const d = (domain: string, name?: string): RecommendedPick => ({ domain, name });

export const RECOMMENDED_SCHOOLS: RecommendedRegion[] = [
  {
    region: "Southeast",
    schools: [d("ua.edu"), d("olemiss.edu"), d("uga.edu"), d("lsu.edu"), d("auburn.edu"), { name: "University of South Carolina-Columbia" }, d("utk.edu"), d("uark.edu"), d("ufl.edu"), d("msstate.edu"), d("uky.edu"), d("fsu.edu"), d("clemson.edu"), d("vanderbilt.edu"), d("tulane.edu")],
  },
  { region: "Virginia and the Carolinas", schools: [d("virginia.edu"), d("unc.edu"), d("wfu.edu"), d("wlu.edu"), d("furman.edu")] },
  { region: "Texas and Oklahoma", schools: [d("tcu.edu"), d("smu.edu"), d("utexas.edu"), d("tamu.edu"), d("baylor.edu"), d("ou.edu"), d("okstate.edu")] },
  {
    region: "Midwest",
    schools: [d("missouri.edu"), d("ku.edu"), d("indiana.edu"), d("purdue.edu"), d("illinois.edu"), d("wisc.edu"), d("umich.edu"), d("osu.edu"), d("miamioh.edu"), d("depauw.edu"), d("northwestern.edu"), d("iastate.edu"), d("unl.edu", "University of Nebraska-Lincoln")],
  },
  { region: "Northeast", schools: [d("psu.edu"), d("syr.edu"), d("cornell.edu"), d("dartmouth.edu"), d("bucknell.edu"), d("lehigh.edu"), d("lafayette.edu")] },
  { region: "West", schools: [d("asu.edu", "Arizona State University Campus Immersion"), d("arizona.edu"), d("usc.edu"), d("colorado.edu"), d("washington.edu"), d("uoregon.edu")] },
];

const picks = RECOMMENDED_SCHOOLS.flatMap((group) => group.schools);
export const RECOMMENDED_DOMAINS = [...new Set(picks.flatMap((pick) => (pick.domain ? [pick.domain] : [])))];
export const RECOMMENDED_NAMES = [...new Set(picks.flatMap((pick) => (pick.name ? [pick.name] : [])))];

export function pickCampus<T extends { name: string; email_domains: string[] | null }>(rows: T[], pick: RecommendedPick): T | null {
  if (pick.name) return rows.find((row) => row.name === pick.name) ?? null;
  const matches = rows.filter((row) => pick.domain && row.email_domains?.includes(pick.domain));
  if (matches.length === 0) return null;
  const score = (name: string) => (/main campus/i.test(name) ? 0 : /online|global|digital|medical|health|law/i.test(name) ? 2 : 1);
  return [...matches].sort((a, b) => score(a.name) - score(b.name) || a.name.length - b.name.length)[0];
}
