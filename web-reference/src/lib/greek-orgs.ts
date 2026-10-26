export const GREEK_ORGS = [
  "Interfraternity Council",
  "Panhellenic Council",
  "National Pan-Hellenic Council",
  "Multicultural Greek Council",
  "Fraternity and Sorority Life",
  "Alpha Chi Omega",
  "Alpha Delta Pi",
  "Alpha Epsilon Phi",
  "Alpha Epsilon Pi",
  "Alpha Gamma Delta",
  "Alpha Gamma Rho",
  "Alpha Kappa Alpha",
  "Alpha Kappa Lambda",
  "Alpha Omicron Pi",
  "Alpha Phi Alpha",
  "Alpha Phi",
  "Alpha Sigma Phi",
  "Alpha Sigma Tau",
  "Alpha Tau Omega",
  "Alpha Xi Delta",
  "Beta Theta Pi",
  "Beta Sigma Psi",
  "Chi Omega",
  "Chi Phi",
  "Chi Psi",
  "Delta Chi",
  "Delta Delta Delta",
  "Delta Gamma",
  "Delta Kappa Epsilon",
  "Delta Phi Epsilon",
  "Delta Sigma Phi",
  "Delta Sigma Theta",
  "Delta Tau Delta",
  "Delta Upsilon",
  "Delta Zeta",
  "FarmHouse",
  "Gamma Phi Beta",
  "Iota Phi Theta",
  "Kappa Alpha Order",
  "Kappa Alpha Psi",
  "Kappa Alpha Theta",
  "Kappa Delta",
  "Kappa Kappa Gamma",
  "Kappa Sigma",
  "Lambda Chi Alpha",
  "Lambda Theta Alpha",
  "Lambda Theta Phi",
  "Omega Psi Phi",
  "Phi Beta Sigma",
  "Phi Delta Theta",
  "Phi Gamma Delta",
  "Phi Kappa Psi",
  "Phi Kappa Tau",
  "Phi Kappa Theta",
  "Phi Mu",
  "Phi Sigma Kappa",
  "Phi Sigma Sigma",
  "Pi Beta Phi",
  "Pi Kappa Alpha",
  "Pi Kappa Phi",
  "Psi Upsilon",
  "Sigma Alpha Epsilon",
  "Sigma Alpha Mu",
  "Sigma Chi",
  "Sigma Delta Tau",
  "Sigma Gamma Rho",
  "Sigma Kappa",
  "Sigma Lambda Gamma",
  "Sigma Nu",
  "Sigma Phi Epsilon",
  "Sigma Pi",
  "Sigma Sigma Sigma",
  "Sigma Tau Gamma",
  "Tau Kappa Epsilon",
  "Theta Chi",
  "Theta Phi Alpha",
  "Theta Xi",
  "Triangle Fraternity",
  "Zeta Beta Tau",
  "Zeta Phi Beta",
  "Zeta Tau Alpha",
  "Acacia Fraternity",
  "Alpha Chi Rho",
  "Alpha Chi Sigma",
  "Alpha Delta Phi",
  "Alpha Delta Gamma",
  "Alpha Kappa Delta Phi",
  "Alpha Omega Epsilon",
  "Alpha Phi Gamma",
  "Alpha Psi Lambda",
  "Alpha Sigma Alpha",
  "Beta Upsilon Chi",
  "Chi Upsilon Sigma",
  "Delta Kappa Delta",
  "Delta Lambda Phi",
  "Delta Phi Lambda",
  "Delta Phi Omega",
  "Delta Psi",
  "Delta Sigma Pi",
  "Delta Xi Phi",
  "Gamma Alpha Omega",
  "Gamma Phi Omega",
  "Kappa Beta Gamma",
  "Kappa Delta Chi",
  "Kappa Delta Rho",
  "Kappa Phi Lambda",
  "Lambda Phi Epsilon",
  "Lambda Pi Chi",
  "Lambda Sigma Upsilon",
  "Lambda Upsilon Lambda",
  "Omega Delta Phi",
  "Omega Phi Beta",
  "Phi Delta Chi",
  "Phi Iota Alpha",
  "Phi Kappa Sigma",
  "Phi Lambda Chi",
  "Phi Sigma Rho",
  "Pi Delta Psi",
  "Pi Kappa Alpha",
  "Pi Lambda Phi",
  "Sigma Alpha Iota",
  "Sigma Beta Rho",
  "Sigma Iota Alpha",
  "Sigma Lambda Beta",
  "Sigma Phi Delta",
  "Sigma Phi Lambda",
  "Sigma Psi Zeta",
  "Tau Beta Sigma",
  "Tau Delta Phi",
  "Theta Delta Chi",
  "Theta Tau",
  "Zeta Psi",
  "St. Anthony Hall",
  "Alpha Pi Omega",
  "Delta Chi Lambda",
  "Gamma Rho Lambda",
  "Lambda Sigma Gamma",
  "Pi Lambda Chi",
  "Tau Psi Omega",
  "Lambda Theta Nu",
  "Mu Sigma Upsilon",
  "Lambda Theta Alpha",
  "Lambda Theta Phi",
  "Sigma Lambda Upsilon",
  "Alpha Sigma Rho",
  "Sigma Omicron Pi",
  "Kappa Phi Gamma",
  "Theta Nu Xi",
  "Iota Phi Theta",
  "Alpha Nu Omega",
  "Lambda Psi Delta",
  "Nu Alpha Kappa",
  "Omega Phi Gamma",
  "Sigma Delta Lambda",
].filter((name, index, all) => all.indexOf(name) === index).sort((a, b) => b.length - a.length);

const GREEK_LETTERS = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"]);

export const COUNCIL_NAMES = new Set(["Interfraternity Council", "Panhellenic Council", "National Pan-Hellenic Council", "Multicultural Greek Council", "Fraternity and Sorority Life"]);

const NICKNAMES: Array<[string, string]> = [
  ["byx", "Beta Upsilon Chi"],
  ["fiji", "Phi Gamma Delta"],
  ["phigam", "Phi Gamma Delta"],
  ["tridelt", "Delta Delta Delta"],
  ["trisigma", "Sigma Sigma Sigma"],
  ["pikes", "Pi Kappa Alpha"],
  ["pike", "Pi Kappa Alpha"],
  ["pikapp", "Pi Kappa Phi"],
  ["sigep", "Sigma Phi Epsilon"],
  ["adpi", "Alpha Delta Pi"],
  ["axo", "Alpha Chi Omega"],
  ["aopi", "Alpha Omicron Pi"],
  ["axid", "Alpha Xi Delta"],
  ["agd", "Alpha Gamma Delta"],
  ["zta", "Zeta Tau Alpha"],
  ["kkg", "Kappa Kappa Gamma"],
  ["piphi", "Pi Beta Phi"],
  ["chio", "Chi Omega"],
  ["dphie", "Delta Phi Epsilon"],
  ["phipsi", "Phi Kappa Psi"],
  ["phidelt", "Phi Delta Theta"],
  ["lambdachi", "Lambda Chi Alpha"],
  ["tke", "Tau Kappa Epsilon"],
  ["ato", "Alpha Tau Omega"],
  ["sae", "Sigma Alpha Epsilon"],
  ["sammy", "Sigma Alpha Mu"],
  ["aepi", "Alpha Epsilon Pi"],
  ["aephi", "Alpha Epsilon Phi"],
  ["deke", "Delta Kappa Epsilon"],
  ["dke", "Delta Kappa Epsilon"],
  ["delts", "Delta Tau Delta"],
  ["phitau", "Phi Kappa Tau"],
  ["kdr", "Kappa Delta Rho"],
  ["gammaphi", "Gamma Phi Beta"],
  ["sigmachi", "Sigma Chi"],
  ["sigchi", "Sigma Chi"],
  ["thetachi", "Theta Chi"],
  ["betatheta", "Beta Theta Pi"],
];

const COUNCIL_HANDLES: Array<[RegExp, string]> = [
  [/ifc|interfraternity/, "Interfraternity Council"],
  [/nphc/, "National Pan-Hellenic Council"],
  [/panhel|cpc/, "Panhellenic Council"],
  [/mgc|mcgc|ugc/, "Multicultural Greek Council"],
];

export function orgFromHandle(value: string): string | null {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const org of GREEK_ORGS) {
    if (COUNCIL_NAMES.has(org)) continue;
    const name = org.toLowerCase().replace(/[^a-z]/g, "");
    if (name.length < 6) continue;
    let at = compact.indexOf(name);
    while (at !== -1) {
      const rest = compact.slice(at + name.length);
      if (![...GREEK_LETTERS].some((letter) => letter.length >= 3 && rest.startsWith(letter))) return org;
      at = compact.indexOf(name, at + 1);
    }
  }
  for (const [nickname, org] of NICKNAMES) if (compact.includes(nickname)) return org;
  return null;
}

export function councilFromHandle(value: string): string | null {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return COUNCIL_HANDLES.find(([pattern]) => pattern.test(compact))?.[1] ?? null;
}

export function nationalHost(hostname: string): boolean {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length !== 2) return false;
  const label = labels[0].replace(/(hq|national|nationals|fraternity|sorority|inc|intl|international|org)$/g, "");
  if (NICKNAMES.some(([nickname]) => label === nickname)) return true;
  return GREEK_ORGS.some((org) => !COUNCIL_NAMES.has(org) && org.toLowerCase().replace(/[^a-z]/g, "") === label);
}

export type OrgMatch = { name: string; at: number; end: number };

export function greekOrgsIn(text: string): OrgMatch[] {
  const value = text.toLowerCase();
  const matches: OrgMatch[] = [];
  for (const org of GREEK_ORGS) {
    const needle = org.toLowerCase();
    let from = 0;
    while (from < value.length) {
      const at = value.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      const before = at === 0 ? "" : value[at - 1];
      const after = value.slice(end);
      const next = after.match(/^\s+([a-z]+)/);
      const continues = next ? GREEK_LETTERS.has(next[1]) : false;
      const covered = matches.some((match) => at < match.end && end > match.at);
      if ((before === "" || /[^a-z]/.test(before)) && (after === "" || /^[^a-z]/.test(after)) && !continues && !covered) matches.push({ name: org, at, end });
      from = end;
    }
  }
  return matches.sort((a, b) => a.at - b.at);
}

export function isGreekOrgName(name: string): boolean {
  return greekOrgsIn(name).length > 0;
}

export function lastGreekOrg(text: string): string | null {
  const matches = greekOrgsIn(text);
  return matches.length > 0 ? matches[matches.length - 1].name : null;
}
