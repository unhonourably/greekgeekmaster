import { describe, expect, it } from "vitest";
import { bugTitle, describeAgent, guessArea, normalizePage } from "@/lib/bugs";

describe("bug report helpers", () => {
  it("names common browsers and systems", () => {
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe("Chrome 141 on Windows");
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0")).toBe("Edge 141 on Windows");
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe("Safari 18 on iOS");
    expect(describeAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe("Firefox 132 on macOS");
    expect(describeAgent(null)).toBe("Unknown browser");
  });

  it("folds chapter slugs and ids so the same page groups together", () => {
    expect(normalizePage("/c/sigma-chi-tcu/chat/6f1c2a7e-1234-4abc-9def-0123456789ab?x=1")).toBe("/c/[chapter]/chat/[id]");
    expect(normalizePage("/admin/bugs")).toBe("/admin/bugs");
  });

  it("guesses the area from the page", () => {
    expect(guessArea("/c/sigma-chi/billing")).toBe("dues");
    expect(guessArea("/c/sigma-chi/chat/abc")).toBe("chat");
    expect(guessArea("/admin/outreach")).toBe("admin");
    expect(guessArea("/account/profile")).toBe("account");
    expect(guessArea("/c/sigma-chi/standards")).toBeNull();
  });

  it("titles a report from its first line", () => {
    expect(bugTitle("Dues page crashed\nWhen I clicked pay.")).toBe("Dues page crashed");
    expect(bugTitle("x".repeat(120), 20)).toHaveLength(20);
  });
});
