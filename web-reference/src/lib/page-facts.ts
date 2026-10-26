import { greekOrgsIn, lastGreekOrg } from "@/lib/greek-orgs";

export type Finding = {
  kind: "chapter" | "dues" | "members" | "housing" | "national" | "email" | "site";
  title: string;
  detail: string | null;
  quote: string | null;
  source_url: string;
};

const SKIP_EMAIL = /^(noreply|no-reply|donotreply|do-not-reply|postmaster|privacy|example|sentry|wix|wordpress|abuse|security)|webmaster/i;

export const PERSONAL_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "me.com", "live.com", "aol.com", "protonmail.com"]);

const EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

const OFF_TOPIC = /^(ithelp|helpdesk|help|support|techsupport|it|ows|registrar|admissions?|finaid|financialaid|bursar|parking|police|titleix|accessibility|ada|careers?|jobs|hr|payroll|library|news|media|marketing|web|webteam)$/i;

export function usableEmail(email: string): boolean {
  const [local = "", domain = ""] = email.split("@");
  return EMAIL.test(email) && !SKIP_EMAIL.test(local) && !OFF_TOPIC.test(local) && !/(^|\.)lists\./i.test(domain) && !/-l$/i.test(local) && !/\.(png|jpe?g|gif|webp|svg)$/i.test(email);
}

function decodeCloudflare(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2 !== 0) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

type EmailHit = { email: string; before: string; after: string; label: string | null };

export function emailsIn(html: string): EmailHit[] {
  const hits: EmailHit[] = [];
  const context = (start: number, end: number, label: string | null) => ({
    before: htmlToText(html.slice(Math.max(0, start - 2000), start)).slice(-240),
    after: htmlToText(html.slice(end, end + 800)).slice(0, 200),
    label,
  });
  const add = (raw: string, start: number, end: number, label: string | null) => {
    const email = raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/[).,;:'"]+$/, "");
    if (usableEmail(email)) hits.push({ email, ...context(start, end, label) });
  };

  const mailto = /<a\b[^>]*\bhref\s*=\s*["']\s*mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const matched of html.matchAll(mailto)) {
    let email = matched[1];
    try {
      email = decodeURIComponent(email);
    } catch {
      continue;
    }
    const label = htmlToText(matched[2]).slice(0, 120) || null;
    add(email.split(",")[0], matched.index, matched.index + matched[0].length, label);
  }

  const protectedEmail = /(?:data-cfemail\s*=\s*["']([0-9a-f]+)["']|\/cdn-cgi\/l\/email-protection#([0-9a-f]+))/gi;
  for (const matched of html.matchAll(protectedEmail)) {
    const decoded = decodeCloudflare(matched[1] ?? matched[2]);
    if (decoded) add(decoded, matched.index, matched.index + matched[0].length, null);
  }

  const stripped = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, (block) => " ".repeat(block.length));
  const plain = /[a-z0-9][a-z0-9._%+-]{0,64}(?:@|&#0*64;|&#x0*40;)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
  for (const matched of stripped.matchAll(plain)) {
    add(matched[0].replace(/&#0*64;|&#x0*40;/i, "@"), matched.index, matched.index + matched[0].length, null);
  }

  const spelled = /([a-z0-9][a-z0-9._%+-]{0,64})\s*[[(]\s*at\s*[\])]\s*([a-z0-9-]+(?:\s*(?:\.|[[(]\s*dot\s*[\])])\s*[a-z0-9-]+)+)/gi;
  for (const matched of stripped.matchAll(spelled)) {
    const domain = matched[2].replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".").replace(/\s+/g, "");
    add(`${matched[1]}@${domain}`, matched.index, matched.index + matched[0].length, null);
  }

  return hits;
}

const NOT_NAME = new Set([
  "fraternity", "sorority", "greek", "life", "office", "council", "university", "college", "student", "students", "affairs", "director", "assistant",
  "associate", "coordinator", "advisor", "adviser", "president", "vice", "dean", "contact", "email", "phone", "panhellenic", "interfraternity",
  "national", "multicultural", "chapter", "chapters", "housing", "recruitment", "center", "campus", "program", "programs", "services", "leadership",
  "involvement", "department", "hall", "room", "suite", "staff", "team", "graduate", "senior", "executive", "board", "relations", "community",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho",
  "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega", "the", "and", "for", "of", "our", "meet", "about", "more", "read", "learn", "click",
  "chair", "treasurer", "secretary", "committee", "social", "member", "members", "educator", "educators", "new", "help", "password", "family",
  "alumni", "chief", "justice", "risk", "management", "finance", "records", "programming", "public", "outreach", "engagement", "inclusion",
  "philanthropy", "service", "scholarship", "development", "relations", "communications", "membership", "standards", "conduct", "office",
  "tri", "chapter", "house", "rush", "sorority", "fraternities", "sororities", "pan", "hellenic", "inc", "incorporated", "sisterhood", "brotherhood",
  "sponsorship", "references", "reference", "contact", "us", "info", "general", "inquiries", "questions", "submit", "send", "message",
  "support", "director", "advising", "assembly", "promenade", "crimson", "facility", "facilities", "operations", "student", "initiatives",
]);

export function nameFor(email: string, hit: EmailHit): string | null {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  const candidates = [hit.label ?? "", hit.before.slice(-140), hit.after.slice(0, 60)];
  for (const source of candidates) {
    const names = [...source.matchAll(/\b(?=([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)\s+(?:[A-Z]\.\s+)?([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)\b)/g)].reverse();
    for (const matched of names) {
      const [first, last] = [matched[1], matched[2]];
      const plain = (word: string) => word.toLowerCase().replace(/'s$/, "").replace(/[^a-z]/g, "");
      if (NOT_NAME.has(plain(first)) || NOT_NAME.has(plain(last)) || /'s$/i.test(last)) continue;
      const firstKey = first.toLowerCase().replace(/[^a-z]/g, "");
      const lastKey = last.toLowerCase().replace(/[^a-z]/g, "");
      if (local.includes(lastKey.slice(0, 4)) || local.includes(firstKey.slice(0, 4)) || local.startsWith(`${firstKey[0]}${lastKey.slice(0, 3)}`)) return `${first} ${last}`;
    }
  }
  return null;
}

const LETTER = "(?:Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)";
const LETTERS_TAIL = new RegExp(`\\b(${LETTER}(?:\\s+${LETTER}){1,3}(?:\\s+(?:Fraternity|Sorority|Sinfonia|Colony|Chapter|Inc\\.?)){0,2})(?:\\s+(?:Email|E-mail|Contact))?[\\s:,-]*$`);

export function lettersBefore(before: string): string | null {
  const tail = before.replace(/\s+/g, " ").trimEnd().slice(-80);
  const matched = tail.match(LETTERS_TAIL);
  if (!matched) return null;
  return matched[1].trim().slice(0, 120);
}

export function councilFromEmail(email: string): string | null {
  const local = email.split("@")[0].toLowerCase().replace(/^(tcu|ua|mizzou|uga|lsu|osu|psu)/, "");
  if (/^ifc/.test(local)) return "IFC";
  if (/^(panhel|pha|apa|cpc|phc)/.test(local)) return "Panhellenic";
  if (/^nphc|nphc$/.test(local)) return "NPHC";
  if (/^(mgc|ugc|mcgc)/.test(local)) return "MGC";
  return null;
}

export function councilFromText(text: string): string | null {
  const value = text.toLowerCase();
  if (/\bifc\b|interfraternity/.test(value)) return "IFC";
  if (/national pan-?hellenic|\bnphc\b/.test(value)) return "NPHC";
  if (/panhel|\bcpc\b|\bapa\b/.test(value)) return "Panhellenic";
  if (/\bmgc\b|\bugc\b|multicultural greek|united greek/.test(value)) return "MGC";
  return null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;|&#8217;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, "\"")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

export function blockLines(html: string): string[] {
  const marked = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|li|h[1-6]|tr|td|th|div|section|article|dd|dt|blockquote|figcaption|caption|header|footer|nav|aside)>/gi, "\n");
  return marked.split("\n").map((line) => htmlToText(line)).filter((line) => line.length > 0);
}

export function pageTitle(html: string): string | null {
  const matched = html.match(/<title[^>]*>([^<]{2,180})<\/title>/i);
  return matched ? htmlToText(matched[1]).slice(0, 180) : null;
}

export function pageAnchors(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let matched: RegExpExecArray | null;
  while ((matched = re.exec(html))) {
    try {
      const url = new URL(matched[1], base);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      url.hash = "";
      out.push({ href: url.href, text: htmlToText(matched[2]).slice(0, 180) });
    } catch {
      continue;
    }
  }
  return out;
}

export function pageLinks(html: string, base: string): string[] {
  return pageAnchors(html, base).map((anchor) => anchor.href);
}

export function fraternityCountQuote(html: string): string | null {
  const text = htmlToText(html);
  const matched = text.match(/\b(?!(?:19|20)\d{2}\b)\d{1,4}\+?\s+(?:greek\s+)?(?:fraternities(?:\s+and\s+sororities)?|sororities(?:\s+and\s+fraternities)?|greek[- ]letter (?:organizations|chapters)|greek (?:organizations|chapters))/i)
    ?? text.match(/\b(?!(?:19|20)\d{2}\b)\d{1,4}\+?\s+(?:chapters|organizations)\s+(?:across|in|within)\s+(?:our|the|four|three|five|two|\d)\s+(?:governing\s+)?councils?/i);
  return matched ? matched[0] : null;
}

export function greekShareQuote(html: string): string | null {
  const text = htmlToText(html);
  const matched = text.match(/[^.]{0,80}\b\d{1,2}(?:\.\d)?\s?(?:%|percent)\s+of\s+(?:our\s+|the\s+|all\s+)?(?:total\s+)?(?:undergraduate|undergrad|student|students|the student body|campus)[^.]{0,80}/i);
  if (!matched || !looksGreek(matched[0])) return null;
  return matched[0].trim().slice(0, 240);
}

export function sameSchool(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase().replace(/^\.+/, "");
  if (!root || /^\d/.test(host) || host === "localhost" || host.endsWith(".local")) return false;
  return host === root || host.endsWith(`.${root}`);
}

export function looksGreek(value: string): boolean {
  return /greek|fratern|soror|pan-?hellenic|\bifc\b|\bnphc\b|\bfsl\b/i.test(value);
}

function windowAround(text: string, index: number, radius = 140): string {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)).replace(/\s+/g, " ").trim();
}

const ROLES: [RegExp, string][] = [
  [/vice president|\bvp\b/g, "Vice President"],
  [/(?<!vice[\s-])president/g, "President"],
  [/assistant dean|associate dean|\bdean\b/g, "Dean"],
  [/assistant director|associate director/g, "Assistant Director"],
  [/(?<!(?:assistant|associate) )director/g, "Director"],
  [/coordinator/g, "Coordinator"],
  [/advis[oe]r/g, "Advisor"],
  [/graduate assistant|\bga\b/g, "Graduate Assistant"],
  [/recruitment|\brush\b/g, "Recruitment"],
  [/treasurer/g, "Treasurer"],
  [/secretary/g, "Secretary"],
  [/specialist/g, "Specialist"],
  [/\bchair\b/g, "Chair"],
];

const COMPOUND_ROLE = /\b(recruitment|rush|philanthropy|social|risk management|new member|membership|scholarship|academic|alumni relations|public relations|marketing|community service|service|standards|programming|diversity|housing|finance|parent relations)\s+(chair(?:man|woman|person)?|director|coordinator|educator|officer|manager)\b/g;

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const EMAIL_ROLES: Array<[RegExp, string]> = [
  [/vicepres|(^|[^a-z])vp([^a-z]|$)|vp$/, "Vice President"],
  [/president|prez|pres$/, "President"],
  [/recruit|rush|pnm/, "Recruitment"],
  [/treasur|finance/, "Treasurer"],
  [/secretar/, "Secretary"],
  [/philanthrop/, "Philanthropy Chair"],
  [/advis/, "Advisor"],
  [/newmember|nme$|memberedu/, "New Member Educator"],
];

export function specificRole(role: string, email: string): string {
  if (role !== "Greek life office" && role !== "Chapter contact" && role !== "Public contact") return role;
  return roleFromEmail(email) ?? role;
}

export function roleFromEmail(email: string): string | null {
  const local = email.split("@")[0].toLowerCase();
  return EMAIL_ROLES.find(([pattern]) => pattern.test(local))?.[1] ?? null;
}

export function roleNear(text: string): string {
  const value = text.toLowerCase();
  let best: { at: number; role: string } | null = null;
  for (const [pattern, role] of ROLES) {
    for (const matched of value.matchAll(pattern)) {
      if (!best || matched.index > best.at) best = { at: matched.index, role };
    }
  }
  let compound: { at: number; end: number; role: string } | null = null;
  for (const matched of value.matchAll(COMPOUND_ROLE)) {
    const area = matched[1] === "rush" ? "recruitment" : matched[1];
    const title = /^chair/.test(matched[2]) ? "chair" : matched[2];
    compound = { at: matched.index, end: matched.index + matched[0].length, role: titleCase(`${area} ${title}`) };
  }
  if (compound && (!best || best.at <= compound.end)) return compound.role;
  return best?.role ?? "Greek life office";
}

export function orgNear(text: string): string | null {
  return lastGreekOrg(text);
}

const DUES_WORDS = /\b(dues|cost of membership|membership (?:costs?|fees?|dues)|new member (?:fees?|dues|costs?)|initiation (?:fees?|costs?)|chapter (?:fees?|costs?)|national (?:fees?|dues)|average (?:cost|dues)|financial (?:obligation|commitment)|semester(?:ly)? (?:fees?|costs?)|parlor fee|social fee)\b/;
const MONEY = /\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\s*(?:dollars|per\s+(?:semester|term|year|month|quarter))/;

export function extractFindings(html: string, sourceUrl: string, domains: string[], greekPage: boolean): Finding[] {
  const text = htmlToText(html);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const push = (finding: Finding) => {
    const key = `${finding.kind}:${finding.title.toLowerCase()}:${(finding.quote ?? "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  if (greekPage) {
    for (const match of greekOrgsIn(text)) {
      if (findings.some((finding) => finding.kind === "chapter" && finding.title === match.name)) continue;
      push({ kind: "chapter", title: match.name, detail: null, quote: windowAround(text, match.at, 90), source_url: sourceUrl });
    }
  }

  const emails = new Set<string>();
  for (const hit of emailsIn(html)) {
    if (emails.has(hit.email)) continue;
    const domain = hit.email.split("@")[1] ?? "";
    const label = hit.label && !hit.label.includes("@") ? hit.label : "";
    const near = `${hit.before.slice(-160)} ${label}`;
    const around = `${hit.before.slice(-140)} ${label} ${hit.after.slice(0, 120)}`.replace(/\s+/g, " ").trim();
    const school = domains.some((item) => domain === item || domain.endsWith(`.${item}`));
    const letters = lettersBefore(`${hit.before} ${label}`);
    const chapter = letters ?? orgNear(near) ?? orgNear(around);
    const own = hit.before.slice(-160);
    const tight = `${own.slice(own.lastIndexOf("@") + 1)} ${label}`;
    const personalChapter = letters ?? orgNear(tight);
    if (!school && !(PERSONAL_DOMAINS.has(domain) && greekPage && personalChapter)) continue;
    if (!greekPage && !looksGreek(around)) continue;
    emails.add(hit.email);
    const name = nameFor(hit.email, hit);
    const organization = letters ?? councilFromEmail(hit.email) ?? chapter ?? councilFromText(near) ?? "Greek life";
    push({
      kind: "email",
      title: hit.email,
      detail: [specificRole(roleNear(hit.before.slice(-100) || around), hit.email), organization, name].filter(Boolean).join(" · "),
      quote: around.slice(0, 240),
      source_url: sourceUrl,
    });
  }

  if (greekPage) {
    const parts = blockLines(html).flatMap((block) => block.split(/(?<=[.!?])\s+/));
    for (const sentence of parts) {
      const line = sentence.trim();
      if (line.length < 18 || line.length > 320 || !/\d/.test(line)) continue;
      const value = line.toLowerCase();
      if (/\b(19|20)\d{2}\b/.test(value) && !/\$|members|dues|chapters|housed|beds?\b|percent|%/.test(value)) continue;
      const counted = value
        .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, " ")
        .replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)/g, " ")
        .replace(/\b\d{1,2}:\d{2}\b/g, " ")
        .replace(/\b\d+(?:st|nd|rd|th)\b/g, " ")
        .replace(/\b\d+\.\d+\b/g, " ")
        .replace(/\b(?:19|20)\d{2}\b/g, " ")
        .replace(/\b\d[\d,]*\s*(?:-|to)?\s*\d*\s*(?:years?|yrs|hours?|hrs|weeks?|days?|minutes?|mins|months?|semesters?|credit|credits|semester hours|gpa|square feet|sq\.? ?ft|feet|miles|different|majors?|states|countries|colleges|organizations|clubs|events|girls|boys|children|kids|students? organizations|on-campus)\b/g, " ")
        .replace(/\btop\s+\d+\s?(?:%|percent)/g, " ")
        .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+\d{1,2}\b/g, " ");
      const big = Math.max(0, ...[...counted.matchAll(/\b\d{1,3}(?:,\d{3})+|\b\d+/g)].map((matched) => Number(matched[0].replace(/,/g, ""))));
      let kind: Finding["kind"] | null = null;
      if (DUES_WORDS.test(value) && MONEY.test(value)) kind = "dues";
      else if (/in-house|in house|out of house|out-of-house|live-in|live in the house|lives? in|housed|chapter house|chapter facility|\bbeds?\b|sleeps|capacity of \d|houses \d/.test(value) && /\d|sixty|fifty|forty|thirty|seventy|eighty|ninety|hundred/.test(counted)) kind = "housing";
      else if (/\bchapters?\b/.test(value) && /national|nationwide|international|worldwide|globally|united states|across the (country|nation)|north america|campuses/.test(value) && /\b\d{2,4}\b/.test(counted)) kind = "national";
      else if (/\bmembers?(?:hip)?\b/.test(value) && big >= 50_000 && /national|nationwide|international|worldwide|globally|united states|initiated|more than|over|nearly/.test(value)) kind = "national";
      else if (/\b\d{1,2}(?:\.\d)?\s?(?:%|percent)\s+of\s+(?:our\s+|the\s+|all\s+)?(?:total\s+)?(?:undergraduate|undergrad|students?|the student body|campus|population)/.test(counted) && (looksGreek(value) || /\bmembers?\b|community|chapters?/.test(value))) kind = "members";
      else if (!/\bgpa\b|grade point|potential new members|\bpnms?\b/.test(value) && big >= 5 && (/\b\d{1,6}\b[^.]{0,40}\b(members|membership|undergraduates|chapter size|colony|brothers|sisters|actives|new members)\b/.test(counted) || /\b(members|membership|chapter size|colony|chapter total|total members|average chapter size)\b[^.]{0,40}\b\d{1,6}\b/.test(counted))) kind = "members";
      if (!kind) continue;
      const org = orgNear(line);
      const focused = line.length > 160 ? (line.match(/.{0,50}\d[\d,+.]*\s+\S+(?:\s+\S+){0,6}/)?.[0] ?? line.slice(0, 160)).trim() : line;
      push({ kind, title: org ?? (kind === "dues" ? "Dues" : kind === "housing" ? "Housing" : kind === "national" ? "National size" : "Membership"), detail: null, quote: focused, source_url: sourceUrl });
    }
  }

  return findings;
}

export function mergeFindings(groups: Finding[][]): Finding[] {
  const merged: Finding[] = [];
  const seen = new Map<string, number>();
  for (const finding of groups.flat()) {
    const key = finding.kind === "chapter" || finding.kind === "email"
      ? `${finding.kind}:${finding.title.toLowerCase()}`
      : finding.kind === "site"
        ? `site:${finding.source_url.toLowerCase().replace(/\/$/, "")}`
        : `${finding.kind}:${(finding.quote ?? "").toLowerCase()}`;
    const at = seen.get(key);
    if (at !== undefined) {
      const kept = merged[at];
      if (finding.kind === "email" && generic(kept.detail) && !generic(finding.detail)) merged[at] = finding;
      continue;
    }
    seen.set(key, merged.length);
    merged.push(finding);
  }
  const order: Finding["kind"][] = ["chapter", "email", "site", "members", "housing", "dues", "national"];
  const capped: Finding[] = [];
  for (const kind of order) capped.push(...merged.filter((finding) => finding.kind === kind).slice(0, kind === "email" ? 400 : 150));
  return capped;
}

function generic(detail: string | null): boolean {
  return !detail || /^Greek life office · Greek life$/.test(detail);
}
