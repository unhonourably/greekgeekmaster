import { readFileSync, writeFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";

const [ipedsPath, hipoPath, outPath, reportPath] = process.argv.slice(2);
if (!ipedsPath || !hipoPath || !outPath) {
  console.error("usage: node scripts/build-universities.mjs <HDyyyy.csv> <world_universities_and_domains.json> <out.sql> [report.json]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h.replace(/^\uFEFF/, "").trim(), r[i].trim()])));
}

function normName(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|at|in|and|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a, b) {
  const x = new Set(normName(a).split(" ").filter(Boolean));
  const y = new Set(normName(b).split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.max(x.size, y.size);
}

function slugify(name) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base.length >= 2 ? base : `university-${base}`).slice(0, 80).replace(/-+$/, "");
}

function hostOf(url) {
  const raw = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/^www\d?\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(raw) ? raw : null;
}

const STATE_LABELS = new Set("al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa pr ri sc sd tn tx ut vt va wa wv wi wy gu vi as mp mass".split(" "));

function eduRoot(host) {
  if (!host || !host.endsWith(".edu")) return null;
  const parts = host.split(".");
  if (parts.length >= 3 && STATE_LABELS.has(parts[parts.length - 2])) return parts.slice(-3).join(".");
  if (parts.length === 2 && STATE_LABELS.has(parts[0])) return null;
  return parts.slice(-2).join(".");
}

function pickShortName(aliases) {
  for (const a of aliases) {
    const t = a.trim();
    if (/^[A-Z][A-Z&-]{1,9}$/.test(t)) return t;
  }
  return null;
}

const ipeds = parseCsv(readFileSync(ipedsPath, "utf8"));
const hipo = JSON.parse(readFileSync(hipoPath, "utf8")).filter((h) => h.country === "United States");
const hipoByDomain = new Map();
for (const h of hipo) {
  for (const d of h.domains ?? []) {
    const k = String(d).toLowerCase();
    if (!hipoByDomain.has(k)) hipoByDomain.set(k, []);
    hipoByDomain.get(k).push(h);
  }
}

const ipedsNameCount = new Map();
for (const r of ipeds) ipedsNameCount.set(normName(r.INSTNM), (ipedsNameCount.get(normName(r.INSTNM)) ?? 0) + 1);

const institutions = [];
for (const r of ipeds) {
  const sector = Number(r.SECTOR);
  if (r.CYACTIVE !== "1" || r.DEGGRANT !== "1" || !(sector >= 1 && sector <= 6)) continue;
  if (!/^[A-Z]{2}$/.test(r.STABBR)) continue;
  const name = r.INSTNM.replace(/\s+/g, " ").replace(/\s*-\s*Main Campus$/i, "").trim();
  if (name.length < 2 || name.length > 200) continue;
  const aliasList = r.IALIAS.split(/\s{2,}|\||;|,/).map((a) => a.trim()).filter((a) => a.length >= 2 && a.length <= 120);
  const host = hostOf(r.WEBADDR || "");
  const root = eduRoot(host);
  const candidates = new Set();
  const provenance = {};
  if (root) {
    candidates.add(root);
    provenance[root] = "ipeds";
  }
  const hipoMatches = [];
  for (const key of [root, host].filter(Boolean)) {
    for (const h of hipoByDomain.get(key) ?? []) if (similar(h.name, name) >= 0.6) hipoMatches.push(h);
  }
  if (!hipoMatches.length) {
    const exact = hipo.filter((h) => normName(h.name) === normName(name));
    if (exact.length === 1 && ipedsNameCount.get(normName(name)) === 1) hipoMatches.push(exact[0]);
  }
  for (const h of hipoMatches) {
    for (const d of h.domains ?? []) {
      const e = eduRoot(String(d).toLowerCase());
      if (e && !candidates.has(e)) {
        candidates.add(e);
        provenance[e] = root ? "hipo-confirmed" : "hipo-name";
      }
    }
  }
  institutions.push({
    unitid: Number(r.UNITID),
    name,
    city: r.CITY.trim() || null,
    state: r.STABBR,
    aliases: aliasList.join(" | ").slice(0, 400) || null,
    shortName: pickShortName(aliasList),
    candidates: [...candidates],
    provenance,
    website: host,
  });
}

const resolver = new Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8", "9.9.9.9"]);
const allDomains = [...new Set(institutions.flatMap((i) => i.candidates))];
const mx = new Map();

async function check(domain) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const records = await resolver.resolveMx(domain);
      return records.some((r) => r.exchange && r.exchange !== ".") ? "mx" : "none";
    } catch (e) {
      if (e.code === "ENODATA" || e.code === "ENOTFOUND" || e.code === "NXDOMAIN") return "none";
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return "error";
}

let done = 0;
const queue = [...allDomains];
await Promise.all(
  Array.from({ length: 48 }, async () => {
    while (queue.length) {
      const d = queue.shift();
      mx.set(d, await check(d));
      done++;
      if (done % 500 === 0) console.error(`checked ${done}/${allDomains.length}`);
    }
  }),
);

const seenSlugs = new Map();
for (const inst of institutions) seenSlugs.set(slugify(inst.name), (seenSlugs.get(slugify(inst.name)) ?? 0) + 1);

const report = { institutions: institutions.length, withDomains: 0, domains: 0, droppedNoMx: [], unresolved: [], hipoAdded: 0, shared: {} };
const owners = new Map();
for (const inst of institutions) for (const d of inst.candidates) if (mx.get(d) === "mx") owners.set(d, [...(owners.get(d) ?? []), inst.name]);
for (const [d, names] of owners) if (names.length > 3) report.shared[d] = names;
const esc = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const checkedAt = new Date().toISOString();
const lines = [];
const usedSlugs = new Set();
for (const inst of institutions) {
  const verified = inst.candidates.filter((d) => mx.get(d) === "mx");
  for (const d of inst.candidates) {
    if (mx.get(d) === "none") report.droppedNoMx.push(`${d} (${inst.name})`);
    if (mx.get(d) === "error") report.unresolved.push(`${d} (${inst.name})`);
  }
  if (verified.length) report.withDomains++;
  report.domains += verified.length;
  report.hipoAdded += verified.filter((d) => inst.provenance[d] !== "ipeds").length;
  let slug = slugify(inst.name);
  if ((seenSlugs.get(slug) ?? 0) > 1) slug = `${slug.slice(0, 76)}-${inst.state.toLowerCase()}`;
  if (usedSlugs.has(slug)) slug = `${slug.slice(0, 70)}-${inst.unitid}`;
  usedSlugs.add(slug);
  const arr = verified.length ? `array[${verified.map(esc).join(", ")}]::text[]` : "'{}'::text[]";
  lines.push(`(${inst.unitid}, ${esc(inst.name)}, ${esc(slug)}, ${esc(inst.shortName)}, ${esc(inst.city)}, ${esc(inst.state)}, ${arr}, ${esc(inst.aliases)}, ${verified.length ? esc(checkedAt) : "null"})`);
}

const sql = [
  "create temporary table seed_universities (unitid int primary key, name text not null, slug text not null, short_name text, city text, state text, email_domains text[] not null, aliases text, checked_at timestamptz);",
  "",
  "insert into pg_temp.seed_universities (unitid, name, slug, short_name, city, state, email_domains, aliases, checked_at) values",
  lines.join(",\n") + ";",
  "",
  "select private.merge_university_seed();",
  "",
  "drop table pg_temp.seed_universities;",
  "",
].join("\n");
writeFileSync(outPath, sql);
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.error(JSON.stringify({ institutions: report.institutions, withDomains: report.withDomains, domains: report.domains, hipoAdded: report.hipoAdded, droppedNoMx: report.droppedNoMx.length, unresolved: report.unresolved.length }));
