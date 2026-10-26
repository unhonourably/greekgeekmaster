import "server-only";
import { COUNCIL_NAMES, councilFromHandle, isGreekOrgName, lastGreekOrg, nationalHost, orgFromHandle } from "@/lib/greek-orgs";
import {
  emailsIn,
  extractFindings,
  fraternityCountQuote,
  greekShareQuote,
  htmlToText,
  lettersBefore,
  looksGreek,
  mergeFindings,
  nameFor,
  pageAnchors,
  pageLinks,
  pageTitle,
  PERSONAL_DOMAINS,
  roleNear,
  sameSchool,
  specificRole,
  usableEmail,
  type Finding,
} from "@/lib/page-facts";

const UA = "GreekGeek/1.0 (+https://greekgeek.org)";

export type PageRead = { url: string; ok: boolean; title: string | null; kind?: "school" | "chapter" | "directory" };

export type ResearchStats = { schoolPages: number; chapterSites: number; directoryOrgs: number };

export type ResearchResult = {
  pages: PageRead[];
  findings: Finding[];
  error: string | null;
  stats: ResearchStats;
};

export type ResearchOptions = { schoolName?: string | null };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type Page = { html: string; finalUrl: string };

type ChapterSite = { url: string; chapter: string; weight: number };

const SOCIAL: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "Facebook"],
  [/(^|\.)twitter\.com$|(^|\.)x\.com$/, "X"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)linktr\.ee$/, "Linktree"],
];

const NO_CRAWL = /(^|\.)(google\.com|goo\.gl|forms\.gle|bit\.ly|tinyurl\.com|dropbox\.com|box\.com|wikipedia\.org|amazon\.com|venmo\.com|paypal\.com|paypal\.me|cash\.app|givebutter\.com|gofundme\.com|eventbrite\.com|apple\.com|spotify\.com|snapchat\.com|pinterest\.com|flickr\.com|vimeo\.com|reddit\.com|discord\.gg|discord\.com|groupme\.com|threads\.net|microsoft\.com|office\.com|sharepoint\.com|zoom\.us|campuslabs\.com|presence\.io|campusgroups\.com|qualtrics\.com|jotform\.com|typeform\.com|calendly\.com|maps\.app\.goo\.gl|cdn\.|adobe\.com|issuu\.com)$/;

const GENERIC_NAME = new Set(["university", "college", "state", "of", "the", "at", "and", "in", "institute", "technology", "community", "campus", "main", "school", "polytechnic", "system", "-", "&"]);

function rootDomain(domains: string[]): string | null {
  return domains.find((domain) => domain.endsWith(".edu")) ?? domains[0] ?? null;
}

function publicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.includes(":") || /^\d+(\.\d+){3}$/.test(host)) return false;
  if (host === "localhost" || /\.(local|internal|lan|home|corp|localhost|test|invalid|example)$/.test(host)) return false;
  return /\.[a-z]{2,}$/.test(host);
}

function socialLabel(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const found = SOCIAL.find(([pattern]) => pattern.test(host));
  if (!found) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (!path || /\/(sharer|share|intent|dialog|plugins|hashtag|explore|watch)\b/i.test(url.pathname) || /^\/(p|reel|tv|status)\//i.test(path)) return null;
  return found[1];
}

function socialUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.protocol = "https:";
  copy.search = "";
  copy.hash = "";
  return copy.href.replace(/\/$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STATE_NAMES = new Set(["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "carolina", "dakota", "columbia"]);

export type SchoolMarks = { strong: RegExp[]; weak: RegExp[] };

function markPattern(mark: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(mark).replace(/ /g, "[\\s-]+")}($|[^a-z0-9])`, "i");
}

export function schoolMarks(name: string | null | undefined, domain: string): SchoolMarks {
  const strong = new Set<string>();
  const weak = new Set<string>();
  const add = (mark: string) => (STATE_NAMES.has(mark) || mark.length < 3 ? weak : strong).add(mark);
  const stem = domain.toLowerCase().replace(/\.edu$/, "").split(".").pop() ?? "";
  if (stem.length >= 2) add(stem);
  if (name) {
    const base = name.toLowerCase().replace(/[-–,(].*$/, "").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
    if (base.length >= 6) strong.add(base);
    const words = base.split(" ").filter((word) => !GENERIC_NAME.has(word));
    const core = words.join(" ");
    if (core.length >= 4 && words.length <= 3) add(core);
    if (/\bstate\b/.test(base) && core.length >= 4) strong.add(`${core} state`);
  }
  for (const mark of strong) weak.delete(mark);
  return { strong: [...strong].map(markPattern), weak: [...weak].map(markPattern) };
}

export function mentionsSchool(marks: SchoolMarks, place: string, text: string): boolean {
  if (marks.strong.length === 0 && marks.weak.length === 0) return true;
  return marks.strong.some((mark) => mark.test(place) || mark.test(text)) || marks.weak.some((mark) => mark.test(place));
}

async function readPage(url: string, fetchImpl: Fetcher, signal: AbortSignal): Promise<Page | null> {
  const ask = () => fetchImpl(url, {
    redirect: "follow",
    signal,
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
  });
  let response: Response;
  try {
    response = await ask();
    if (response.status === 429 || response.status === 503) throw new Error("busy");
  } catch (error) {
    if (signal.aborted) throw error;
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await ask();
  }
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!/html|text\/plain/i.test(type)) return null;
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2_000_000) return null;
  const html = (await response.text()).slice(0, 2_000_000);
  return { html, finalUrl: response.url || url };
}

async function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function canonical(href: string, domain: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || !sameSchool(url.hostname, domain)) return null;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|pptx?|xlsx?|mp4|mp3|mov|ics|css|js)$/i.test(url.pathname)) return null;
    if (/\/(login|logout|signin|sign-in|cas|sso|shibboleth|calendar\/\d|events?\/\d{4}|news\/\d{4}|search)(\/|$)/i.test(url.pathname)) return null;
    if (/[@\s()]|\/(www\.)?[a-z0-9-]+\.(com|org|net|edu)(\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
    if (/[[\]]|\/(events?|events-list|news|photos?|gallery|documents|surveys?-forms|useful-links|past-newsletters|club_signup|calendar|feed|tag|category|page\/\d+|wp-json|print)(\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
    const club = url.searchParams.get("club_url");
    url.hash = "";
    url.search = club && /^[a-z0-9_-]{1,80}$/i.test(club) && /contact|leadership|officers|about/i.test(url.pathname) ? `?club_url=${club}` : "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function externalCanonical(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!publicHost(url.hostname) || url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) return null;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|pptx?|xlsx?|mp4|mp3|mov)$/i.test(url.pathname)) return null;
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function linkScore(url: URL, text: string, fromGreek: boolean): number {
  if (url.hostname.startsWith("engage.")) {
    if (/contact|leadership|officers/i.test(url.pathname) && url.search) return 52;
    return looksGreek(`${url.href} ${text}`) || isGreekOrgName(text) || (fromGreek && isGreekOrgName(url.pathname.replace(/[-_/]+/g, " "))) ? 50 : 0;
  }
  const contactish = /\/(contact|contact-us|staff|our-staff|our-team|team|meet-the-team|meet-our-staff|leadership|officers|executive-board|exec-board|board|council-officers|directory|people)(\/|$)/i.test(url.pathname)
    || /^(contact( us)?|staff|our staff|meet (the|our) (team|staff)|officers|executive board|council officers|leadership)$/i.test(text.trim());
  if (looksGreek(`${url.href} ${text}`)) return contactish ? 55 : 50;
  if (fromGreek && contactish) return 45;
  if (fromGreek && (isGreekOrgName(text) || isGreekOrgName(url.pathname.replace(/[-_/]+/g, " ")))) return 47;
  if (fromGreek && /\/(about|councils?|chapters?|our-chapters|organizations|recruit\w*|join|members?\w*|new-member\w*|intake|costs?|dues|financ\w*|fees|housing|scorecards?|report-cards?|grade-reports?|statistics|stats|facts|community|parents?|families)(\/|$)/i.test(url.pathname)) return 42;
  if (/\/(student-life|campus-life|student-affairs|get-involved|involvement|organizations|student-organizations|clubs)(\/|$)/i.test(url.pathname)) return 20;
  if (/\/[^/]*a-z$/i.test(url.pathname) || /\/(?:atoz|a-to-z|directory)$/i.test(url.pathname)) return 18;
  if (url.hostname.startsWith("getinvolved.") || url.hostname.startsWith("fsl.") || url.hostname.startsWith("greek") || url.hostname.startsWith("studentlife.") || url.hostname.startsWith("involvement.")) return 20;
  return 0;
}

function directoryLetters(pageUrl: string, anchors: { href: string; text: string }[]): string[] {
  const base = new URL(pageUrl);
  const path = base.pathname.replace(/\/$/, "") || "/";
  if (!/\/[^/]*a-z$/i.test(path) && !/\/(?:atoz|a-to-z|directory)$/i.test(path)) return [];
  const letters: string[] = [];
  for (const anchor of anchors) {
    try {
      const url = new URL(anchor.href);
      const child = url.pathname.replace(/\/$/, "");
      if (url.hostname !== base.hostname || !child.startsWith(`${path}/`)) continue;
      if (child.slice(path.length + 1).includes("/")) continue;
      letters.push(url.href);
    } catch {
      continue;
    }
  }
  return [...new Set(letters)].slice(0, 30);
}

function chapterEmail(email: string, domains: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || !usableEmail(email)) return false;
  return PERSONAL_DOMAINS.has(domain) || domains.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function personName(value: unknown, email: string): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { firstName?: unknown; lastName?: unknown; primaryEmailAddress?: unknown };
  const contactEmail = typeof row.primaryEmailAddress === "string" ? row.primaryEmailAddress.trim().toLowerCase() : "";
  if (contactEmail !== email) return null;
  const first = typeof row.firstName === "string" ? row.firstName.trim() : "";
  const last = typeof row.lastName === "string" ? row.lastName.trim() : "";
  if (!/^[A-Za-z][A-Za-z.'-]{0,30}$/.test(first) || !/^[A-Za-z][A-Za-z.'-]{0,40}$/.test(last)) return null;
  return `${first} ${last}`;
}

function engageHosts(html: string, base: string, domain: string): string[] {
  const hosts = new Set<string>();
  for (const href of pageLinks(html, base)) {
    try {
      const url = new URL(href);
      if (url.protocol !== "https:") continue;
      if (/^[a-z0-9-]+\.campuslabs\.com$/i.test(url.hostname) && /^\/engage(\/|$)/i.test(url.pathname)) {
        hosts.add(`${url.origin}/engage`);
        continue;
      }
      if (!sameSchool(url.hostname, domain)) continue;
      if (url.hostname.startsWith("engage.") || (!url.hostname.startsWith("www.") && /^\/organizations\/?$/i.test(url.pathname))) hosts.add(url.origin);
    } catch {
      continue;
    }
  }
  return [...hosts];
}

function xmlLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((matched) => matched[1]);
}

function engageOrigin(origin: string, domain: string, host: string): boolean {
  if (sameSchool(host, domain)) return true;
  try {
    return new URL(origin).hostname === host;
  } catch {
    return false;
  }
}

async function readJson(url: string, origin: string, domain: string, fetchImpl: Fetcher, signal: AbortSignal): Promise<unknown | null> {
  const response = await fetchImpl(url, { redirect: "follow", signal, headers: { "user-agent": UA, accept: "application/json" } });
  if (!response.ok) return null;
  let finalHost = "";
  try {
    finalHost = new URL(response.url || url).hostname;
  } catch {
    return null;
  }
  if (!engageOrigin(origin, domain, finalHost)) return null;
  const text = (await response.text()).slice(0, 2_000_000);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function engageLinks(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) out.push(value.trim());
  };
  for (const [key, value] of Object.entries(detail)) {
    if (/website|url$/i.test(key) && !/image|profile|picture|logo/i.test(key)) add(value);
  }
  const social = detail.socialMedia;
  if (social && typeof social === "object") for (const value of Object.values(social as Record<string, unknown>)) add(value);
  return out;
}

async function readEngage(origin: string, domain: string, domains: string[], fetchImpl: Fetcher, deadline: number): Promise<{ findings: Finding[]; links: Array<{ url: string; chapter: string }>; orgs: number }> {
  const findings: Finding[] = [];
  const links: Array<{ url: string; chapter: string }> = [];
  const listed = new Map<string, { id: string; name: string; categories: string[]; summary: string; key: string }>();
  const terms = ["", "fraternity", "sorority", "greek", "panhellenic", "interfraternity", "multicultural greek", "pan-hellenic"];
  await Promise.all(terms.map(async (term) => {
    const pages = term === "" ? 6 : 2;
    for (let page = 0; page < pages && Date.now() < deadline; page++) {
      const data = await timed(7_000, (signal) => readJson(`${origin}/api/discovery/search/organizations?top=100&skip=${page * 100}&query=${encodeURIComponent(term)}`, origin, domain, fetchImpl, signal));
      const value = data && typeof data === "object" && Array.isArray((data as { value?: unknown }).value) ? (data as { value: unknown[] }).value : [];
      for (const row of value) {
        if (!row || typeof row !== "object") continue;
        const item = row as { Id?: unknown; Name?: unknown; CategoryNames?: unknown; Status?: unknown; Visibility?: unknown; WebsiteKey?: unknown; Summary?: unknown };
        const categories = Array.isArray(item.CategoryNames) ? item.CategoryNames.filter((name): name is string => typeof name === "string") : [];
        const id = typeof item.Id === "string" || typeof item.Id === "number" ? String(item.Id) : "";
        const name = typeof item.Name === "string" ? item.Name.trim().slice(0, 160) : "";
        const greekCategory = categories.some((category) => looksGreek(category));
        if (item.Status !== "Active" || item.Visibility !== "Public" || !/^\d+$/.test(id) || name.length < 2 || listed.has(id)) continue;
        if (categories.length > 0 && !greekCategory && !isGreekOrgName(name)) continue;
        if (!greekCategory && !looksGreek(name) && !isGreekOrgName(name)) continue;
        if (/honor society|honors society|professional|academic/i.test(categories.join(" ")) && !greekCategory) continue;
        const key = typeof item.WebsiteKey === "string" && /^[a-z0-9-]{1,80}$/i.test(item.WebsiteKey) ? item.WebsiteKey : id;
        listed.set(id, { id, name, categories, summary: typeof item.Summary === "string" ? item.Summary.trim().slice(0, 320) : "", key });
      }
      if (value.length < 100) break;
    }
  }));

  const chosen = [...listed.values()].slice(0, 160);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(8, chosen.length) }, async () => {
    while (index < chosen.length && Date.now() < deadline) {
      const org = chosen[index++];
      const detail = await timed(6_000, (signal) => readJson(`${origin}/api/discovery/organization/${org.id}`, origin, domain, fetchImpl, signal));
      const row = detail && typeof detail === "object" ? detail as Record<string, unknown> : null;
      const summary = (typeof row?.summary === "string" && row.summary.trim()) || org.summary;
      const description = typeof row?.description === "string" ? row.description : "";
      const key = typeof row?.websiteKey === "string" && /^[a-z0-9-]{1,80}$/i.test(row.websiteKey) ? row.websiteKey : org.key;
      const source = `${origin}/organization/${key}`;
      const chapter = lastGreekOrg(org.name) ?? org.name;
      const quote = [org.categories.join(", "), summary].filter(Boolean).join(". ").slice(0, 320);
      findings.push({ kind: "chapter", title: org.name, detail: org.categories.join(", ") || null, quote: quote || null, source_url: source });
      const about = `${summary} ${description}`;
      findings.push(...extractFindings(about, source, domains, true).filter((finding) => finding.kind !== "chapter" && finding.kind !== "email").map((finding) => (/^(Dues|Housing|Membership|National size)$/.test(finding.title) ? { ...finding, title: chapter } : finding)));
      for (const hit of emailsIn(description)) {
        if (!chapterEmail(hit.email, domains)) continue;
        findings.push({ kind: "email", title: hit.email, detail: `${chapterRole(hit.before, hit.email)} · ${chapter}`, quote: quote || null, source_url: source });
      }
      for (const link of engageLinks(row)) links.push({ url: link, chapter });
      const email = typeof row?.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!chapterEmail(email, domains)) continue;
      const name = personName(row?.primaryContact, email);
      findings.push({
        kind: "email",
        title: email,
        detail: `${name ? "Primary contact" : specificRole("Public contact", email)} · ${org.name}${name ? ` · ${name}` : ""}`,
        quote: quote || null,
        source_url: source,
      });
    }
  }));
  return { findings, links, orgs: listed.size };
}

async function sitemapGreek(origin: string, domain: string, fetchImpl: Fetcher, deadline: number): Promise<string[]> {
  const out: string[] = [];
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const robots = await timed(5_000, async (signal) => {
    const response = await fetchImpl(`${origin}/robots.txt`, { redirect: "follow", signal, headers: { "user-agent": UA, accept: "text/plain" } });
    return response.ok ? (await response.text()).slice(0, 100_000) : null;
  });
  for (const matched of (robots ?? "").matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
    try {
      const url = new URL(matched[1]);
      if (url.protocol === "https:" && sameSchool(url.hostname, domain)) queue.unshift(url.href);
    } catch {
      continue;
    }
  }
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < 8 && Date.now() < deadline && out.length < 20) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const xml = await timed(6_000, async (signal) => {
      const response = await fetchImpl(url, { redirect: "follow", signal, headers: { "user-agent": UA, accept: "application/xml,text/xml" } });
      if (!response.ok) return null;
      if (!sameSchool(new URL(response.url || url).hostname, domain)) return null;
      return (await response.text()).slice(0, 3_000_000);
    });
    if (!xml) continue;
    const locs = xmlLocs(xml);
    const nested = locs.filter((loc) => /\.xml(\.gz)?$/i.test(new URL(loc, origin).pathname));
    nested.sort((a, b) => Number(/page|post|fsl|greek|student|life|organization/i.test(b)) - Number(/page|post|fsl|greek|student|life|organization/i.test(a)));
    for (const loc of nested) if (!seen.has(loc) && queue.length < 12 && !loc.endsWith(".gz")) queue.push(loc);
    for (const loc of locs) {
      let parsed: URL;
      try {
        parsed = new URL(loc);
      } catch {
        continue;
      }
      if (parsed.protocol !== "https:" || !sameSchool(parsed.hostname, domain) || parsed.pathname.toLowerCase().endsWith(".xml")) continue;
      if (looksGreek(parsed.hostname.split(".")[0] ?? "") || looksGreek(parsed.pathname.replace(/[-_]/g, " "))) out.push(parsed.href);
    }
  }
  return [...new Set(out)].slice(0, 20);
}

function bingTarget(href: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"));
    if (!/(^|\.)bing\.com$/i.test(url.hostname)) return url.href;
    const packed = url.searchParams.get("u") ?? "";
    if (!packed.startsWith("a1")) return null;
    const decoded = Buffer.from(packed.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function searchResults(html: string, domain: string): Array<{ url: string; title: string }> {
  const out: Array<{ url: string; title: string }> = [];
  for (const block of html.split(/<li class="b_algo"/i).slice(1)) {
    const matched = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!matched) continue;
    const target = bingTarget(matched[1]);
    if (!target) continue;
    try {
      const url = new URL(target);
      if (!sameSchool(url.hostname, domain)) continue;
      url.protocol = "https:";
      out.push({ url: url.href, title: htmlToText(matched[2]).replace(/\s+/g, " ").trim().slice(0, 200) });
    } catch {
      continue;
    }
  }
  return out;
}

async function searchGreek(domain: string, fetchImpl: Fetcher): Promise<Array<{ url: string; title: string }>> {
  const queries = [`site:${domain} fraternity sorority life`, `site:${domain} greek life chapters`, `site:${domain} panhellenic interfraternity council`];
  const lists = await Promise.all(queries.map((query) => timed(8_000, async (signal) => {
    const response = await fetchImpl(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-US&count=20`, {
      redirect: "follow",
      signal,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", accept: "text/html", "accept-language": "en-US,en;q=0.9" },
    });
    return response.ok ? searchResults((await response.text()).slice(0, 1_500_000), domain) : [];
  })));
  const seen = new Set<string>();
  return lists.flatMap((list) => list ?? []).filter((item) => !seen.has(item.url) && Boolean(seen.add(item.url))).slice(0, 30);
}

function chapterRole(text: string, email: string): string {
  const role = specificRole(roleNear(text), email);
  return role === "Greek life office" ? "Chapter contact" : role;
}

function attribute(tag: string, name: string): string {
  const matched = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']{1,160})["']`, "i"));
  return matched ? htmlToText(matched[1]) : "";
}

export function handleMatches(value: string, chapter: string): boolean {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = chapter.toLowerCase().replace(/[^a-z]/g, "");
  const initials = chapter.split(/\s+/).filter((word) => /^[a-z]/i.test(word)).map((word) => word[0]).join("").toLowerCase();
  return (name.length >= 5 && compact.includes(name)) || (initials.length >= 3 && compact.includes(initials));
}

export function chapterLinks(html: string, base: string, domain: string): { sites: ChapterSite[]; social: Finding[] } {
  const sites: ChapterSite[] = [];
  const social: Finding[] = [];
  const stem = domain.replace(/\.edu$/, "").split(".").pop() ?? "";
  const re = /<a\b([^>]*)\bhref\s*=\s*["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const matched of html.matchAll(re)) {
    let url: URL;
    try {
      url = new URL(matched[2], base);
    } catch {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || sameSchool(url.hostname, domain) || !publicHost(url.hostname)) continue;
    const tag = `${matched[1]} ${matched[3]}`;
    const text = `${htmlToText(matched[4])} ${attribute(tag, "aria-label")} ${attribute(tag, "title")}`.replace(/\s+/g, " ").trim().slice(0, 200);
    const label = socialLabel(url);
    const handle = `${url.hostname.replace(/^www\./, "")} ${label ? url.pathname : url.hostname.split(".").length > 2 ? url.hostname : url.pathname}`;
    const fromUrl = orgFromHandle(label ? url.pathname : `${url.hostname} ${url.pathname}`);
    const named = lastGreekOrg(text) ?? lettersBefore(text);
    const own = named && !COUNCIL_NAMES.has(named) ? named : null;
    const inner = htmlToText(matched[4]).trim();
    const websiteWord = /^(website|chapter website|chapter site|visit (?:our |the |chapter )?(?:web)?site|web ?site|homepage|home page)$/i.test(inner);
    const before = own || fromUrl ? "" : htmlToText(html.slice(Math.max(0, matched.index - 900), matched.index)).slice(-220);
    const near = own || fromUrl ? null : lastGreekOrg(before.slice(-160)) ?? lettersBefore(before);
    const nearby = near && !COUNCIL_NAMES.has(near) && (websiteWord || handleMatches(handle, near)) ? near : null;
    const council = named && COUNCIL_NAMES.has(named) && councilFromHandle(label ? url.pathname : url.hostname) === named ? named : null;
    const chapter = own ?? fromUrl ?? nearby ?? council;
    if (!chapter) continue;
    if (label) {
      social.push({ kind: "site", title: chapter, detail: label, quote: null, source_url: socialUrl(url) });
      continue;
    }
    if (SOCIAL.some(([pattern]) => pattern.test(url.hostname.toLowerCase())) || NO_CRAWL.test(url.hostname.toLowerCase())) continue;
    const href = externalCanonical(url.href);
    if (!href) continue;
    const local = stem.length >= 3 && `${url.hostname}${url.pathname}`.toLowerCase().includes(stem);
    const weight = (local ? 4 : 0) + (/website|chapter/i.test(text) ? 2 : 0) + (url.pathname === "/" ? 1 : 0);
    sites.push({ url: href, chapter, weight });
  }
  return { sites, social };
}

function siteScore(pathname: string, text: string): number {
  const value = `${pathname} ${text}`.toLowerCase();
  if (/contact|get in touch|reach us/.test(value)) return 10;
  if (/officer|exec|board|leadership|cabinet|council/.test(value)) return 10;
  if (/dues|cost|financ|fees|payment|parents?|families/.test(value)) return 9;
  if (/recruit|rush|join|membership|new[- ]member|pnm|intake|interest/.test(value)) return 8;
  if (/member|brothers|sisters|roster|our[- ]chapter|composite/.test(value)) return 7;
  if (/housing|house|live[- ]in|living/.test(value)) return 7;
  if (/about|history|who we are/.test(value)) return 6;
  if (/alumni/.test(value)) return 4;
  if (/philanthropy|service/.test(value)) return 3;
  return 0;
}

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export async function readGreekLife(domains: string[], fetchImpl: Fetcher = fetch, budgetMs = 45_000, options: ResearchOptions = {}): Promise<ResearchResult> {
  const stats: ResearchStats = { schoolPages: 0, chapterSites: 0, directoryOrgs: 0 };
  const domain = rootDomain(domains);
  if (!domain) return { pages: [], findings: [], error: "This school has no .edu domain on file, so there is no site to read.", stats };
  const started = Date.now();
  const deadline = started + budgetMs;
  const schoolUntil = started + budgetMs * 0.5;
  const directoryUntil = started + budgetMs * 0.72;
  const pages: PageRead[] = [];
  const found: Finding[][] = [];
  const seen = new Set<string>();
  const candidates = new Map<string, ChapterSite>();
  const marks = schoolMarks(options.schoolName, domain);

  const collect = (page: Page) => {
    const links = chapterLinks(page.html, page.finalUrl, domain);
    if (links.social.length > 0) found.push(links.social);
    for (const site of links.sites) {
      const current = candidates.get(site.url);
      if (!current || current.weight < site.weight) candidates.set(site.url, site);
    }
  };

  const take = async (url: string, greekPage: boolean, quiet = false): Promise<Page | null> => {
    const href = canonical(url, domain);
    if (!href || seen.has(href) || Date.now() > deadline) return null;
    seen.add(href);
    const page = await timed(7_000, (signal) => readPage(href, fetchImpl, signal));
    if (!page || !sameSchool(new URL(page.finalUrl).hostname, domain)) {
      if (!quiet) pages.push({ url: href, ok: false, title: null, kind: "school" });
      return null;
    }
    const title = pageTitle(page.html);
    const greek = greekPage || looksGreek(page.finalUrl) || looksGreek(title ?? "");
    pages.push({ url: page.finalUrl, ok: true, title, kind: "school" });
    stats.schoolPages++;
    found.push(extractFindings(page.html, page.finalUrl, domains, greek));
    const share = greek ? greekShareQuote(page.html) : null;
    if (share) found.push([{ kind: "members", title: "Greek community", detail: null, quote: share, source_url: page.finalUrl }]);
    if (greek) collect(page);
    return page;
  };

  const harvest = async (url: string): Promise<{ href: string; text: string }[]> => {
    const href = canonical(url, domain);
    if (!href || seen.has(href) || Date.now() > deadline) return [];
    seen.add(href);
    const page = await timed(7_000, (signal) => readPage(href, fetchImpl, signal));
    if (!page || !sameSchool(new URL(page.finalUrl).hostname, domain)) return [];
    return pageAnchors(page.html, page.finalUrl);
  };

  const searching = searchGreek(domain, fetchImpl).catch(() => []);
  let home: Page | null = null;
  for (const origin of [`https://www.${domain}`, `https://${domain}`]) {
    home = await take(origin, false);
    if (home) break;
  }
  const searched = await searching;
  if (!home && searched.length === 0) return { pages, findings: [], error: `Could not open the public site at ${domain}.`, stats };
  const homeCount = home ? fraternityCountQuote(home.html) : null;
  if (home && homeCount) found.push([{ kind: "members", title: "Chapters", detail: null, quote: homeCount, source_url: home.finalUrl }]);

  const hosts = new Set(home ? engageHosts(home.html, home.finalUrl, domain) : []);
  const queued = new Set<string>(seen);
  const queue: { url: string; score: number; depth: number }[] = [];
  const consider = (href: string, text: string, depth: number, fromGreek: boolean) => {
    const key = canonical(href, domain);
    if (!key || queued.has(key) || depth > 4) return;
    let url: URL;
    try {
      url = new URL(key);
    } catch {
      return;
    }
    const score = linkScore(url, text, fromGreek);
    if (score <= 0) return;
    queued.add(key);
    queue.push({ url: key, score, depth });
  };
  if (home) for (const anchor of pageAnchors(home.html, home.finalUrl)) consider(anchor.href, anchor.text, 1, false);
  for (const hit of searched) {
    const key = canonical(hit.url, domain);
    if (!key || queued.has(key)) continue;
    const greek = looksGreek(`${hit.url} ${hit.title}`) || isGreekOrgName(hit.title);
    queued.add(key);
    queue.push({ url: key, score: greek ? 51 : 25, depth: 1 });
  }

  const probes = ["greeklife", "fsl", "greek", "ofsl", "fraternity-sorority"].map((sub) => `https://${sub}.${domain}`).filter((url) => !queued.has(canonical(url, domain) ?? url));
  const [sitemap, opened] = await Promise.all([
    sitemapGreek(home ? new URL(home.finalUrl).origin : `https://www.${domain}`, domain, fetchImpl, schoolUntil),
    Promise.all(probes.map((url) => take(url, true, true))),
  ]);
  for (const loc of sitemap) consider(loc, "", 1, false);
  for (const page of opened) {
    if (!page) continue;
    for (const host of engageHosts(page.html, page.finalUrl, domain)) hosts.add(host);
    for (const anchor of pageAnchors(page.html, page.finalUrl)) consider(anchor.href, anchor.text, 2, true);
  }

  let read = 0;
  while (queue.length > 0 && read < 160 && Date.now() < schoolUntil) {
    queue.sort((a, b) => b.score - a.score);
    const batch = queue.splice(0, 6);
    const results = await Promise.all(batch.map(async (job) => ({ job, page: await take(job.url, job.score >= 47) })));
    read += batch.length;
    for (const { job, page } of results) {
      if (!page) continue;
      for (const host of engageHosts(page.html, page.finalUrl, domain)) hosts.add(host);
      const count = fraternityCountQuote(page.html);
      if (count) found.push([{ kind: "members", title: "Chapters", detail: null, quote: count, source_url: page.finalUrl }]);
      const fromGreek = job.score >= 47 || looksGreek(page.finalUrl) || looksGreek(pageTitle(page.html) ?? "");
      const anchors = pageAnchors(page.html, page.finalUrl);
      const letters = job.depth <= 2 ? directoryLetters(page.finalUrl, anchors) : [];
      for (let i = 0; i < letters.length && Date.now() < schoolUntil; i += 6) {
        const lists = await Promise.all(letters.slice(i, i + 6).map((letter) => harvest(letter)));
        for (const list of lists) for (const anchor of list) consider(anchor.href, anchor.text, job.depth + 1, false);
      }
      for (const anchor of anchors) consider(anchor.href, anchor.text, job.depth + 1, fromGreek);
    }
  }

  hosts.add(`https://engage.${domain}`);
  const directories = [...hosts].sort((a, b) => Number(b !== `https://engage.${domain}`) - Number(a !== `https://engage.${domain}`)).slice(0, 3);
  const directoryResults = await Promise.all(directories.map(async (origin) => {
    try {
      return { origin, result: await readEngage(origin, domain, domains, fetchImpl, directoryUntil) };
    } catch {
      return { origin, result: null };
    }
  }));
  for (const { origin, result } of directoryResults) {
    if (!result || result.findings.length === 0) continue;
    found.push(result.findings);
    stats.directoryOrgs += result.orgs;
    pages.push({ url: `${origin}/organizations`, ok: true, title: "Organization directory", kind: "directory" });
    for (const link of result.links) {
      let url: URL;
      try {
        url = new URL(link.url);
      } catch {
        continue;
      }
      const label = socialLabel(url);
      if (label) {
        found.push([{ kind: "site", title: link.chapter, detail: label, quote: null, source_url: socialUrl(url) }]);
        continue;
      }
      if (sameSchool(url.hostname, domain) || NO_CRAWL.test(url.hostname.toLowerCase()) || SOCIAL.some(([pattern]) => pattern.test(url.hostname.toLowerCase()))) continue;
      const href = externalCanonical(url.href);
      if (href && !candidates.has(href)) candidates.set(href, { url: href, chapter: link.chapter, weight: 5 });
    }
  }

  const perChapter = new Map<string, number>();
  const perHost = new Set<string>();
  const sites = [...candidates.values()]
    .sort((a, b) => b.weight - a.weight)
    .filter((site) => {
      const host = hostKey(new URL(site.url).hostname);
      const count = perChapter.get(site.chapter) ?? 0;
      if (perHost.has(host) || count >= 2) return false;
      perHost.add(host);
      perChapter.set(site.chapter, count + 1);
      return true;
    })
    .slice(0, 60);

  const readChapterSite = async (site: ChapterSite) => {
    if (Date.now() > deadline - 1_500) return;
    const home = await timed(7_000, (signal) => readPage(site.url, fetchImpl, signal));
    if (!home) return;
    let finalUrl: URL;
    try {
      finalUrl = new URL(home.finalUrl);
    } catch {
      return;
    }
    const finalHost = finalUrl.hostname.toLowerCase();
    if (!publicHost(finalHost) || sameSchool(finalHost, domain) || NO_CRAWL.test(finalHost) || SOCIAL.some(([pattern]) => pattern.test(finalHost))) return;
    const title = pageTitle(home.html);
    const homeText = htmlToText(home.html);
    const place = `${finalHost.replace(/\./g, " ")} ${finalUrl.pathname.replace(/[-_/.]+/g, " ")} ${new URL(site.url).hostname.replace(/\./g, " ")}`;
    if (nationalHost(finalHost) ? !mentionsSchool({ strong: [...marks.strong, ...marks.weak], weak: [] }, place, "") : !mentionsSchool(marks, `${place} ${title ?? ""}`, homeText)) return;
    const host = hostKey(finalUrl.hostname);
    const owned = finalUrl.pathname === "/" || finalUrl.pathname.split("/").filter(Boolean).length <= 1;
    const readOne = (page: Page) => {
      const pageTitleText = pageTitle(page.html);
      pages.push({ url: page.finalUrl, ok: true, title: pageTitleText ? `${site.chapter} · ${pageTitleText}` : site.chapter, kind: "chapter" });
      const facts = extractFindings(page.html, page.finalUrl, domains, true)
        .filter((finding) => finding.kind !== "email" && finding.kind !== "chapter")
        .map((finding) => (finding.kind === "national" ? finding : { ...finding, title: site.chapter }));
      found.push(facts);
      const emails: Finding[] = [];
      for (const hit of emailsIn(page.html)) {
        const emailDomain = hit.email.split("@")[1] ?? "";
        const ownDomain = owned && (emailDomain === host || emailDomain.endsWith(`.${host}`) || host.endsWith(`.${emailDomain}`));
        const school = domains.some((item) => emailDomain === item || emailDomain.endsWith(`.${item}`));
        if (!ownDomain && !school && !PERSONAL_DOMAINS.has(emailDomain)) continue;
        if (emails.some((email) => email.title === hit.email)) continue;
        const label = hit.label && !hit.label.includes("@") ? hit.label : "";
        const name = nameFor(hit.email, hit);
        const around = `${hit.before.slice(-140)} ${label} ${hit.after.slice(0, 120)}`.replace(/\s+/g, " ").trim();
        emails.push({
          kind: "email",
          title: hit.email,
          detail: [chapterRole(`${hit.before.slice(-100)} ${label}`, hit.email), site.chapter, name].filter(Boolean).join(" · "),
          quote: around.slice(0, 240) || null,
          source_url: page.finalUrl,
        });
      }
      found.push(emails);
      const social: Finding[] = [];
      for (const anchor of pageAnchors(page.html, page.finalUrl)) {
        try {
          const url = new URL(anchor.href);
          const label = socialLabel(url);
          const path = url.pathname.replace(/[-_./@]+/g, " ");
          const local = mentionsSchool({ strong: [...marks.strong, ...marks.weak], weak: [] }, path, "");
          if (label && local && !/hq$|national|headquarters/i.test(url.pathname)) social.push({ kind: "site", title: site.chapter, detail: label, quote: null, source_url: socialUrl(url) });
        } catch {
          continue;
        }
      }
      found.push(social.slice(0, 8));
    };
    stats.chapterSites++;
    found.push([{ kind: "site", title: site.chapter, detail: "Chapter website", quote: title, source_url: home.finalUrl }]);
    readOne(home);
    const subpages = new Map<string, number>();
    for (const anchor of pageAnchors(home.html, home.finalUrl)) {
      try {
        const url = new URL(anchor.href);
        if (hostKey(url.hostname) !== host || url.href === home.finalUrl) continue;
        if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|mp4)$/i.test(url.pathname) || /\/(cart|checkout|account|login|wp-admin|feed|tag|category)(\/|$)/i.test(url.pathname)) continue;
        const score = siteScore(url.pathname, anchor.text);
        if (score <= 0) continue;
        url.hash = "";
        const key = url.href.replace(/\/$/, "");
        subpages.set(key, Math.max(score, subpages.get(key) ?? 0));
      } catch {
        continue;
      }
    }
    const picked = [...subpages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([url]) => url);
    const extra = await Promise.all(picked.map((url) => (Date.now() > deadline - 1_000 ? null : timed(7_000, (signal) => readPage(url, fetchImpl, signal)))));
    for (const page of extra) {
      if (!page) continue;
      try {
        if (hostKey(new URL(page.finalUrl).hostname) !== host) continue;
      } catch {
        continue;
      }
      readOne(page);
    }
  };

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, sites.length) }, async () => {
    while (next < sites.length && Date.now() < deadline - 2_000) await readChapterSite(sites[next++]);
  }));

  const findings = mergeFindings(found);
  const unique = new Map<string, PageRead>();
  for (const page of pages) {
    const existing = unique.get(page.url);
    if (!existing || (!existing.ok && page.ok)) unique.set(page.url, page);
  }
  const ordered = [...unique.values()].sort((a, b) => Number(b.ok) - Number(a.ok));
  return {
    pages: ordered.slice(0, 220),
    findings,
    error: findings.length === 0 ? "The site opened, but its public pages did not list chapters, dues, housing, or a Greek life email." : null,
    stats,
  };
}
