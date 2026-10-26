import "server-only";

const UA = "GreekGeek/1.0 (+https://greekgeek.org; amare@greekgeek.org)";

let active = 0;
const waiting: Array<() => void> = [];

export function photoSlot<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      work().then(resolve, reject).finally(() => {
        active -= 1;
        waiting.shift()?.();
      });
    };
    if (active < 3) run();
    else waiting.push(run);
  });
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !["university", "college", "state", "the", "campus"].includes(word));
}

function titleFits(school: string, title: string): boolean {
  const wanted = words(school);
  if (wanted.length === 0) return title.toLowerCase().includes(school.toLowerCase().slice(0, 16));
  const hits = wanted.filter((word) => title.toLowerCase().includes(word)).length;
  return hits >= Math.min(2, wanted.length);
}


async function summary(title: string): Promise<{ url: string; page: string } | null> {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { type?: string; title?: string; thumbnail?: { source?: string } };
  if (data.type === "disambiguation" || !data.thumbnail?.source || !data.title) return null;
  return { url: data.thumbnail.source, page: data.title };
}

export async function usablePhoto(url: string): Promise<boolean> {
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(5_000) });
  const type = response.headers.get("content-type") ?? "";
  await response.body?.cancel();
  return response.ok && type.startsWith("image/");
}

export async function wikipediaPhoto(school: string, city: string | null): Promise<{ url: string; page: string } | null> {
  const direct = await summary(school).catch(() => null);
  if (direct && titleFits(school, direct.page)) return direct;
  const query = [school, city, "university"].filter(Boolean).join(" ");
  const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!response?.ok) return direct;
  const data = (await response.json()) as { query?: { search?: Array<{ title: string }> } };
  const title = data.query?.search?.[0]?.title;
  if (!title || !titleFits(school, title)) return direct && titleFits(school, direct.page) ? direct : null;
  return (await summary(title).catch(() => null)) ?? null;
}
