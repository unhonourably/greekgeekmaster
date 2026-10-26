import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmailHtml } from "@/lib/email-template";

const base = { appUrl: "https://greekgeek.org", preheader: "Preview", heading: "Welcome", paragraphs: ["Hello there."] };

describe("email template", () => {
  it("escapes every user-controlled field", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const html = renderEmailHtml({
      ...base,
      heading: "<script>alert(1)</script>",
      greeting: "Hi <b>Sam</b>,",
      paragraphs: ["Pay <img src=x onerror=alert(1)>"],
      note: "\"quoted\"",
      footer: "<i>footer</i>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Sam</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<i>footer</i>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders one white action button", () => {
    const html = renderEmailHtml({ ...base, action: { label: "Accept invitation", url: "https://greekgeek.org/invite/abc?x=1&y=2" } });
    expect(html).toContain("Accept invitation");
    expect(html.match(/href="https:\/\/greekgeek\.org\/invite\/abc\?x=1&amp;y=2"/g)).toHaveLength(1);
    expect(html).toContain("background:#ffffff");
    expect(html).toContain("background:#111111");
    expect(html).toContain("&copy; 2026 greek geek. all rights reserved.");
  });

  it("refuses non-http action links", () => {
    const html = renderEmailHtml({ ...base, action: { label: "Go", url: "javascript:alert(1)" } });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">Go</a>");
  });

  it("keeps the same card on any app url and shows a verification code", () => {
    const html = renderEmailHtml({ ...base, appUrl: "http://localhost:3001", code: "123456" });
    expect(html).not.toContain("<img");
    expect(html).toContain("letter-spacing:8px");
    expect(html).toContain("123456");
    expect(html).toContain("background:#000000");
  });

  it("puts the preheader in a hidden preview block and omits empty sections", () => {
    const html = renderEmailHtml(base);
    expect(html).toMatch(/display:none[^>]*>Preview/);
    expect(html).not.toContain("If the button doesn't work");
  });
});
