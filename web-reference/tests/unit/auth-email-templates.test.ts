import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authEmailTemplates } from "@/lib/auth-email-templates";

const dir = join(process.cwd(), "supabase", "templates");

describe("supabase auth email templates", () => {
  const templates = authEmailTemplates();

  it("link every action through /auth/confirm with the right type", () => {
    const types: Record<string, string> = { confirmation: "signup", magic_link: "magiclink", recovery: "recovery", email_change: "email_change", invite: "invite" };
    for (const [key, type] of Object.entries(types)) {
      const t = templates.find((x) => x.key === key)!;
      const href = `href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}"`;
      expect(t.html.split(href)).toHaveLength(2);
      expect(t.html).not.toContain("__supabase_action__");
      expect(t.html).not.toContain('href="#"');
    }
    const code = templates.find((x) => x.key === "reauthentication")!;
    expect(code.html).toContain("{{ .Token }}");
    expect(code.html).toContain("letter-spacing:8px");
  });

  it("match the committed files in supabase/templates", () => {
    if (process.env.WRITE_AUTH_TEMPLATES === "1") {
      mkdirSync(dir, { recursive: true });
      for (const t of templates) writeFileSync(join(dir, t.file), t.html);
    }
    for (const t of templates) {
      const path = join(dir, t.file);
      expect(existsSync(path), `${t.file} is missing; regenerate with WRITE_AUTH_TEMPLATES=1`).toBe(true);
      expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(t.html);
    }
  });
});
