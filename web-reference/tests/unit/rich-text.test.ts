import { describe, expect, it } from "vitest";
import { parseImagePaths, plainText, richTextIsEmpty, sanitizeRichText } from "@/lib/rich-text";

const CHAPTER = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";

describe("sanitizeRichText", () => {
  it("keeps formatting and drops scripts, styles, and unsafe links", () => {
    const html = sanitizeRichText(`<p>Hello <strong>there</strong></p><script>alert(1)</script><style>body{}</style><a href="javascript:alert(1)">x</a><a href="https://example.com">site</a>`);
    expect(html).toContain("<p>Hello <strong>there</strong></p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("style");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
  });

  it("allows chapter pictures and drops every other image", () => {
    const safe = `/api/chapter-media/${CHAPTER}/${FILE}.png`;
    const html = sanitizeRichText(`<img src="${safe}" alt="House"><img src="https://evil.test/a.png"><img src="/api/chapter-media/not-a-uuid/file.png">`);
    expect(html).toContain(`src="${safe}"`);
    expect(html).toContain('alt="House"');
    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("not-a-uuid");
  });

  it("turns formatted text into a plain excerpt", () => {
    expect(plainText("<p>Hello <strong>there</strong></p><br>line")).toBe("Hello there line");
    expect(richTextIsEmpty("<p><br></p>")).toBe(true);
    expect(richTextIsEmpty("<p>Minutes</p>")).toBe(false);
  });

  it("keeps only this chapter's stored pictures", () => {
    const good = `${CHAPTER}/${FILE}.jpg`;
    const other = `33333333-3333-4333-8333-333333333333/${FILE}.jpg`;
    expect(parseImagePaths(JSON.stringify([good, other, "nope", good]), CHAPTER)).toEqual([good]);
  });
});
