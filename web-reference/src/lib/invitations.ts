import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brand } from "@/config/brand";
import { hmac, randomToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email-template";
import { serverEnv } from "@/lib/env";
import type { MemberClass } from "@/lib/permissions";

export function invitationHash(token: string): string {
  return hmac("invitation", token);
}

export type InvitationInput = { email: string; fullName: string | null; memberClass: MemberClass; roleKeys: string[] };

export async function createAndSendInvitation(
  supabase: SupabaseClient,
  chapter: { id: string; organization_name: string; designation: string | null },
  inviterName: string,
  input: InvitationInput,
  importBatch: string | null = null,
): Promise<{ ok: true; devLink: string | null; link: string; delivered: boolean } | { ok: false; error: { message?: string; code?: string } }> {
  const token = randomToken(32);
  const { error } = await supabase.rpc("create_chapter_invitation", {
    p_chapter: chapter.id,
    p_email: input.email,
    p_full_name: input.fullName,
    p_member_class: input.memberClass,
    p_role_keys: input.roleKeys,
    p_token_hash: invitationHash(token),
    p_import_batch: importBatch,
  });
  if (error) return { ok: false, error };
  const link = `${serverEnv.appUrl()}/invite/${token}`;
  const chapterName = [chapter.organization_name, chapter.designation].filter(Boolean).join(", ");
  const firstName = input.fullName ? input.fullName.split(" ")[0] : null;
  const result = await sendEmail({
    to: input.email,
    subject: `${inviterName} invited you to ${chapterName}`,
    text: `${firstName ? `Hi ${firstName},\n\n` : ""}${inviterName} invited you to join ${chapterName} on ${brand.name}.\n\nAccept the invitation: ${link}\n\nThe link expires in 14 days. Sign in or create an account with ${input.email} to accept.`,
    html: renderEmailHtml({
      appUrl: serverEnv.appUrl(),
      preheader: `${inviterName} invited you to join ${chapterName}. The link expires in 14 days.`,
      heading: `You're invited to ${chapterName}`,
      greeting: firstName ? `Hi ${firstName},` : null,
      paragraphs: [
        `${inviterName} invited you to join ${chapterName} on ${brand.name}, where the chapter handles dues, events, messages, and announcements.`,
        `Sign in or create an account with ${input.email} to accept.`,
      ],
      action: { label: "Accept invitation", url: link },
      note: "This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.",
    }),
  });
  return { ok: true, devLink: !result.delivered && !serverEnv.isProduction() ? link : null, link, delivered: result.delivered };
}

export type CsvMember = { line: number; email: string; fullName: string | null; memberClass: MemberClass };

const CLASS_ALIASES: Record<string, MemberClass> = {
  active: "active",
  member: "active",
  new: "new_member",
  new_member: "new_member",
  "new member": "new_member",
  associate: "associate",
  alumni: "alumni",
  alum: "alumni",
  alumnus: "alumni",
  alumna: "alumni",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseMemberCsv(text: string, maxRows = 500): { rows: CsvMember[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim());
  const errors: string[] = [];
  const rows: CsvMember[] = [];
  const seen = new Set<string>();
  let header: string[] | null = null;
  lines.forEach((raw, index) => {
    if (!raw) return;
    const cells = splitCsvLine(raw);
    if (!header && cells.some((c) => /^e-?mail$/i.test(c))) {
      header = cells.map((c) => c.toLowerCase());
      return;
    }
    const cols = header ?? ["email", "name", "class"];
    const get = (names: string[]) => {
      const i = cols.findIndex((c) => names.includes(c));
      return i >= 0 ? cells[i] ?? "" : "";
    };
    const email = get(["email", "e-mail"]).toLowerCase();
    const name = get(["name", "full name", "full_name"]);
    const klass = get(["class", "member class", "member_class", "status"]).toLowerCase();
    const line = index + 1;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(`Line ${line}: "${email || raw.slice(0, 40)}" is not a valid email.`);
      return;
    }
    if (seen.has(email)) {
      errors.push(`Line ${line}: ${email} appears more than once.`);
      return;
    }
    const memberClass = klass ? CLASS_ALIASES[klass] : "active";
    if (!memberClass) {
      errors.push(`Line ${line}: unknown member class "${klass}". Use active, new member, associate, or alumni.`);
      return;
    }
    seen.add(email);
    rows.push({ line, email, fullName: name ? name.slice(0, 120) : null, memberClass });
  });
  if (rows.length > maxRows) {
    errors.push(`Import up to ${maxRows} people at a time.`);
    return { rows: rows.slice(0, maxRows), errors };
  }
  return { rows, errors };
}
