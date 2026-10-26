const ALLOWED = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "img"]);

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function safeLink(value: string): string | null {
  const url = value.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(url) || /^http:\/\/[^\s"'<>]+$/i.test(url) || /^mailto:[^\s"'<>]+$/i.test(url)) return url;
  return null;
}

function safeImage(value: string): string | null {
  const url = value.trim();
  if (/^\/api\/chapter-media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i.test(url)) return url;
  return null;
}

function attr(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(source);
  return match?.[1] ?? match?.[2] ?? "";
}

export function sanitizeRichText(input: string): string {
  const withoutDanger = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)[^>]*\/?\s*>/gi, "");
  return withoutDanger.replace(/<\/?\s*([a-z0-9]+)([^>]*)>/gi, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    if (match.startsWith("</")) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const href = safeLink(attr(rawAttrs, "href"));
      return href ? `<a href="${escapeAttr(href)}" rel="noopener noreferrer">` : "<a>";
    }
    if (tag === "img") {
      const src = safeImage(attr(rawAttrs, "src"));
      if (!src) return "";
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(attr(rawAttrs, "alt").slice(0, 140))}">`;
    }
    return `<${tag}>`;
  });
}

export function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(p|div|h2|h3|li|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function richTextIsEmpty(value: string): boolean {
  return plainText(sanitizeRichText(value)) === "";
}

const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

export function parseImagePaths(raw: string, chapterId: string, limit = 6): string[] {
  let list: unknown;
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const prefix = `${chapterId}/`;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string" || !item.startsWith(prefix) || !IMAGE_PATH.test(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
